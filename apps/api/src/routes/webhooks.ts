import { Router, Request, Response } from "express";
import {
  verifyNombaWebhook,
  classify,
  shortfallKobo,
  excessKobo,
  calculateSplits,
} from "@nairarails/webhook-core";
import {
  NombaWebhookEnvelopeSchema,
  NOMBA_SIGNATURE_HEADER,
} from "@nairarails/shared-types";
import { logger } from "../lib/logger.js";

const router: Router = Router();

/**
 * POST /api/v1/webhooks/nomba
 *
 * ⚠️  This route is mounted with express.raw({ type: "*\/*" }) in server.ts.
 *     req.body is a Buffer here — do NOT parse it before calling verifyNombaWebhook.
 *     The raw bytes must be intact for the HMAC check to pass.
 *
 * Flow:
 *   1. Verify HMAC-SHA256 signature — reject 401 if invalid (fail-closed)
 *   2. Parse the JSON body
 *   3. Idempotency: check if requestId was already processed
 *   4. Persist the raw event (webhook_events table — Phase 3)
 *   5. Classify the payment (paid / underpayment / overpayment / unmatched)
 *   6. Update order status (Phase 3)
 *   7. Execute splits if status is "paid" (Phase 4)
 *   8. Always respond 200 — Nomba will retry on non-2xx
 */
router.post(
  "/webhooks/nomba",
  // express.raw is applied at server level for this path — see server.ts
  async (req: Request, res: Response): Promise<void> => {
    const rawBody = req.body as Buffer;

    // ── 1. Signature verification ─────────────────────────────────────────────
    const signatureHeader = req.headers[NOMBA_SIGNATURE_HEADER];
    const secret = process.env["NOMBA_WEBHOOK_SECRET"];

    if (secret) {
      // Secret is configured — enforce signature verification (production behaviour).
      if (
        typeof signatureHeader !== "string" ||
        !verifyNombaWebhook(rawBody, signatureHeader, secret)
      ) {
        logger.warn(
          { path: req.path, hasHeader: !!signatureHeader },
          "Webhook rejected: invalid signature"
        );
        res.status(401).json({
          error: { code: "INVALID_WEBHOOK_SIGNATURE", message: "Signature mismatch" },
        });
        return;
      }
    } else {
      // ⚠️  No secret configured — skipping signature verification.
      // UNCOMMENT the block above (and remove this else branch) once you have
      // your NOMBA_WEBHOOK_SECRET and are ready to enforce verification.
      logger.warn(
        { path: req.path },
        "NOMBA_WEBHOOK_SECRET not set — signature verification DISABLED (dev/testing only)"
      );
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    let envelope: ReturnType<typeof NombaWebhookEnvelopeSchema.parse>;
    try {
      const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
      envelope = NombaWebhookEnvelopeSchema.parse(parsed);
    } catch (err) {
      logger.warn({ err }, "Webhook rejected: invalid payload shape");
      // Return 200 so Nomba doesn't retry a fundamentally malformed event.
      res.status(200).json({ status: "ignored", reason: "unrecognised_shape" });
      return;
    }

    const { requestId, event_type, data } = envelope;
    const txn = data.transaction;

    logger.info(
      {
        requestId,
        event_type,
        transactionId: txn.transactionId,
        amount_kobo: txn.transactionAmount,
        merchantTxRef: txn.merchantTxRef,
      },
      "Nomba webhook received"
    );

    // ── 3. Idempotency ────────────────────────────────────────────────────────
    // TODO (Phase 3): query webhook_events WHERE request_id = requestId.
    // If a row exists, short-circuit here — the event was already handled.
    // const existing = await db.webhookEvents.findByRequestId(requestId);
    // if (existing) {
    //   logger.info({ requestId }, "Duplicate webhook ignored");
    //   res.status(200).json({ status: "duplicate", requestId });
    //   return;
    // }

    // ── 4. Persist event ──────────────────────────────────────────────────────
    // TODO (Phase 3): INSERT INTO webhook_events (request_id, event_type, raw_payload)
    // The unique constraint on request_id acts as a DB-level idempotency guard.

    // ── 5 & 6. Classify and update order ─────────────────────────────────────
    // Only virtual_account.funded events carry a payment we need to reconcile.
    if (event_type === "virtual_account.funded") {
      const expectedKobo = 0; // TODO (Phase 3): fetch from orders WHERE virtual_account_number = txn.aliasAccountNumber
      const receivedKobo = txn.transactionAmount;

      const classification = classify(expectedKobo, receivedKobo);
      const shortfall = shortfallKobo(expectedKobo, receivedKobo);
      const excess = excessKobo(expectedKobo, receivedKobo);

      logger.info(
        {
          requestId,
          merchantTxRef: txn.merchantTxRef,
          classification,
          expectedKobo,
          receivedKobo,
          shortfall,
          excess,
        },
        "Payment classified"
      );

      // TODO (Phase 3): UPDATE orders SET status = classification WHERE ...
      // TODO (Phase 3): INSERT INTO ledger_entries ...

      // ── 7. Execute splits on full payment ───────────────────────────────────
      if (classification === "paid") {
        // TODO (Phase 3): fetch splits[] from the orders/splits tables
        // const splits = await db.splits.findByOrderRef(orderRef);
        // const allocations = calculateSplits(receivedKobo, splits);
        // for (const allocation of allocations) {
        //   await nombaClient.lookupBankAccount(allocation.bank_code, allocation.account_number);
        //   await nombaClient.transferToBank(allocation);
        // }
        logger.info({ requestId, receivedKobo }, "Splits would execute here (Phase 4)");
      }
    }

    // ── 8. Always respond 200 ─────────────────────────────────────────────────
    // Responding 200 even on business-logic issues is correct — Nomba interprets
    // anything else as a delivery failure and will retry, which causes duplicates.
    res.status(200).json({
      status: "received",
      requestId,
      transactionId: txn.transactionId,
      timestamp: new Date().toISOString(),
    });
  }
);

export { router as webhookRouter };
