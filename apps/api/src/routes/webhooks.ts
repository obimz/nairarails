import { Router, type Router as ExpressRouter, Request, Response } from "express";
import {
  verifyNombaWebhook,
  classify,
  shortfallKobo,
  excessKobo,
} from "@nairarails/webhook-core";
import {
  NombaWebhookEnvelopeSchema,
  NOMBA_SIGNATURE_HEADER,
  NOMBA_TIMESTAMP_HEADER,
} from "@nairarails/shared-types";
import { logger } from "../lib/logger.js";

const router: ExpressRouter = Router();

/**
 * POST /api/v1/webhooks/nomba
 *
 * ⚠️  Mounted with express.raw({ type: "*\/*" }) in server.ts so req.body is a
 *     raw Buffer. We parse JSON manually AFTER signature verification.
 *
 * Confirmed real Nomba signature algorithm:
 *   HMAC-SHA256( colon-joined fields, secret ) → base64
 *   Fields: event_type:requestId:userId:walletId:transactionId:type:time:responseCode:timestamp
 *
 * Real event to act on: event_type === "payment_success" && transaction.type === "vact_transfer"
 * Order reference:      data.transaction.aliasAccountReference  (set as accountRef on VA creation)
 * Sender info:          data.customer.accountNumber / bankCode / senderName
 */
router.post(
  "/webhooks/nomba",
  async (req: Request, res: Response): Promise<void> => {
    const rawBody = req.body as Buffer;

    // ── 1. Parse body first (needed to extract fields for signature check) ────
    let envelope: ReturnType<typeof NombaWebhookEnvelopeSchema.parse>;
    try {
      const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
      envelope = NombaWebhookEnvelopeSchema.parse(parsed);
    } catch (err) {
      logger.warn({ err }, "Webhook rejected: invalid payload shape");
      // Return 200 — Nomba must not retry a fundamentally malformed payload.
      res.status(200).json({ status: "ignored", reason: "unrecognised_shape" });
      return;
    }

    const { requestId, event_type, data } = envelope;
    const { transaction: txn, merchant, customer } = data;

    // ── 2. Signature verification — always enforced, no bypass ───────────────
    const secret = process.env["NOMBA_WEBHOOK_SECRET"];

    if (!secret) {
      // Server misconfiguration — refuse all requests rather than silently accepting
      // unsigned webhooks. Fix: add NOMBA_WEBHOOK_SECRET to your environment.
      logger.error("NOMBA_WEBHOOK_SECRET is not set — refusing webhook request");
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Webhook secret not configured" },
      });
      return;
    }

    const signatureHeader = req.headers[NOMBA_SIGNATURE_HEADER];
    const timestamp       = req.headers[NOMBA_TIMESTAMP_HEADER];

    if (typeof signatureHeader !== "string" || typeof timestamp !== "string") {
      logger.warn({ path: req.path }, "Webhook rejected: missing signature headers");
      res.status(401).json({
        error: { code: "INVALID_WEBHOOK_SIGNATURE", message: "Missing signature headers" },
      });
      return;
    }

    const valid = verifyNombaWebhook(
      {
        event_type,
        requestId,
        userId:        merchant.userId,
        walletId:      merchant.walletId,
        transactionId: txn.transactionId,
        type:          txn.type,
        time:          txn.time,
        responseCode:  txn.responseCode ?? "",
        timestamp,
      },
      signatureHeader,
      secret
    );

    if (!valid) {
      logger.warn({ path: req.path, requestId }, "Webhook rejected: invalid signature");
      res.status(401).json({
        error: { code: "INVALID_WEBHOOK_SIGNATURE", message: "Signature mismatch" },
      });
      return;
    }

    logger.info(
      {
        requestId,
        event_type,
        transactionId:         txn.transactionId,
        transactionType:       txn.type,
        amount_kobo:           txn.transactionAmount,
        aliasAccountReference: txn.aliasAccountReference,
      },
      "Nomba webhook received"
    );

    // ── 3. Idempotency ────────────────────────────────────────────────────────
    // TODO (Phase 3): check webhook_events WHERE request_id = requestId.
    // If a row exists → already handled, return 200 immediately.
    // const existing = await prisma.webhookEvent.findUnique({ where: { requestId } });
    // if (existing) {
    //   logger.info({ requestId }, "Duplicate webhook ignored");
    //   res.status(200).json({ status: "duplicate", requestId });
    //   return;
    // }

    // ── 4. Persist raw event ──────────────────────────────────────────────────
    // TODO (Phase 3): INSERT webhook_events (request_id, event_type, raw_payload)
    // The unique DB constraint on request_id is the hard idempotency guarantee.

    // ── 5 & 6. Classify and update order ─────────────────────────────────────
    // Act only on virtual account funding events.
    // Real Nomba event: event_type === "payment_success" + type === "vact_transfer"
    if (event_type === "payment_success" && txn.type === "vact_transfer") {
      // Order reference is aliasAccountReference — set as accountRef on VA creation.
      const orderRef = txn.aliasAccountReference;

      if (!orderRef) {
        logger.warn({ requestId }, "payment_success has no aliasAccountReference — quarantining");
        // TODO (Phase 3): insert into an unmatched/quarantine log
        res.status(200).json({ status: "unmatched_quarantined", requestId });
        return;
      }

      // TODO (Phase 3): fetch order by orderRef
      // const order = await prisma.order.findUnique({ where: { orderRef } });
      // if (!order) {
      //   logger.warn({ requestId, orderRef }, "No order found — quarantining");
      //   res.status(200).json({ status: "unmatched_quarantined", requestId });
      //   return;
      // }

      const expectedKobo = 0; // TODO (Phase 3): order.expectedAmountKobo
      const receivedKobo = txn.transactionAmount;

      const classification = classify(expectedKobo, receivedKobo);
      const shortfall      = shortfallKobo(expectedKobo, receivedKobo);
      const excess         = excessKobo(expectedKobo, receivedKobo);

      // Sender details for potential refund — from data.customer (not transaction)
      const senderName    = customer?.senderName    ?? null;
      const senderAccount = customer?.accountNumber ?? null;
      const senderBank    = customer?.bankCode      ?? null;

      logger.info(
        {
          requestId,
          orderRef,
          classification,
          expectedKobo,
          receivedKobo,
          shortfall,
          excess,
          senderName,
          senderAccount,
          senderBank,
        },
        "Payment classified"
      );

      // TODO (Phase 3): UPDATE orders SET status = classification,
      //   received_amount_kobo = receivedKobo,
      //   sender_account_number = senderAccount,
      //   sender_bank_code = senderBank,
      //   sender_name = senderName
      //   WHERE order_ref = orderRef

      // TODO (Phase 3): INSERT ledger_entry

      // ── 7. Execute splits on full payment ───────────────────────────────────
      if (classification === "paid") {
        // TODO (Phase 4):
        // const splits = await prisma.split.findMany({ where: { orderRef } });
        // const allocations = calculateSplits(receivedKobo, splits);
        // for (const allocation of allocations) {
        //   const { accountName } = await nombaClient.lookupBankAccount(allocation.bank_code, allocation.account_number);
        //   await nombaClient.transferToBank({ ...allocation, accountName, merchantTxRef: `split_${orderRef}_${allocation.party}_${requestId}` });
        // }
        logger.info({ requestId, orderRef, receivedKobo }, "Splits would execute here (Phase 4)");
      }
    }

    // ── 8. Always respond 200 ─────────────────────────────────────────────────
    res.status(200).json({
      status:        "received",
      requestId,
      transactionId: txn.transactionId,
      timestamp:     new Date().toISOString(),
    });
  }
);

export { router as webhookRouter };
