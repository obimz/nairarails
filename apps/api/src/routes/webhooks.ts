import { Router, type Router as ExpressRouter, Request, Response } from "express";
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
  NOMBA_TIMESTAMP_HEADER,
} from "@nairarails/shared-types";
import { prisma } from "../db/client.js";
import { lookupBankAccount, transferToBank } from "../integrations/nombaClient.js";
import { logger } from "../lib/logger.js";

const router: ExpressRouter = Router();

/**
 * POST /api/v1/webhooks/nomba
 *
 * ⚠️  Mounted with express.raw({ type: "*\/*" }) in server.ts so req.body is a
 *     raw Buffer. We parse JSON manually after extracting the signature inputs.
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

    // ── 1. Parse body ─────────────────────────────────────────────────────────
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

    // ── 2. Signature verification ─────────────────────────────────────────────
    const secret = process.env["NOMBA_WEBHOOK_SECRET"];
    if (!secret) {
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

    // ── 3. Idempotency check ──────────────────────────────────────────────────
    // Check BEFORE persisting. If the row already exists, this event was already
    // handled — return 200 immediately so Nomba stops retrying.
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { requestId },
    });
    if (existingEvent) {
      logger.info({ requestId }, "Duplicate webhook ignored");
      res.status(200).json({ status: "duplicate_ignored", requestId });
      return;
    }

    // ── 4. Persist raw event ──────────────────────────────────────────────────
    // Write the raw payload BEFORE any business logic so if anything downstream
    // throws, we still have a record that this event arrived.
    // The unique constraint on request_id is the DB-level idempotency guarantee —
    // if two requests race here, the second INSERT will fail and we'll return 200.
    try {
      await prisma.webhookEvent.create({
        data: {
          requestId,
          eventType:  event_type,
          rawPayload: rawBody.toString("utf8"),
        },
      });
    } catch (err: unknown) {
      // Unique constraint violation — another concurrent request already persisted it.
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        logger.info({ requestId }, "Race-condition duplicate webhook — ignored");
        res.status(200).json({ status: "duplicate_ignored", requestId });
        return;
      }
      throw err;
    }

    // ── 5 & 6. Classify and update order ─────────────────────────────────────
    // Only act on virtual account funding events.
    if (event_type === "payment_success" && txn.type === "vact_transfer") {
      const orderRef = txn.aliasAccountReference;

      if (!orderRef) {
        logger.warn({ requestId }, "payment_success has no aliasAccountReference — quarantining");
        // Event is already persisted above — quarantine is implicit (no order linked).
        res.status(200).json({ status: "unmatched_quarantined", requestId });
        return;
      }

      const order = await prisma.order.findUnique({ where: { orderRef } });
      if (!order) {
        logger.warn({ requestId, orderRef }, "No order found for aliasAccountReference — quarantining");
        res.status(200).json({ status: "unmatched_quarantined", requestId });
        return;
      }

      const expectedKobo = Number(order.expectedAmountKobo);
      const receivedKobo = txn.transactionAmount;

      const classification = classify(expectedKobo, receivedKobo);
      const shortfall      = shortfallKobo(expectedKobo, receivedKobo);
      const excess         = excessKobo(expectedKobo, receivedKobo);

      const senderName    = customer?.senderName    ?? null;
      const senderAccount = customer?.accountNumber ?? null;
      const senderBank    = customer?.bankCode      ?? null;

      logger.info(
        { requestId, orderRef, classification, expectedKobo, receivedKobo, shortfall, excess },
        "Payment classified"
      );

      // Update order status + sender details + received amount, and append a
      // ledger entry — all in a single transaction so they're always consistent.
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { orderRef },
          data: {
            status:               classification,
            receivedAmountKobo:   BigInt(receivedKobo),
            senderName:           senderName,
            senderAccountNumber:  senderAccount,
            senderBankCode:       senderBank,
          },
        });

        await tx.ledgerEntry.create({
          data: {
            orderRef,
            entryType:   "payment_received",
            amountKobo:  BigInt(receivedKobo),
            reference:   txn.transactionId,
            narration:   `Payment ${classification}: received ${receivedKobo} kobo, expected ${expectedKobo} kobo`,
          },
        });

        // Mark the webhook event as processed.
        await tx.webhookEvent.update({
          where: { requestId },
          data:  { processedAt: new Date() },
        });
      });

      // ── 7. Execute splits or settlement transfer ──────────────────────────
      // Splits run on exact payment AND overpayment — split the expected amount only,
      // the excess is quarantined and refundable via POST /exceptions/:ref/refund-excess.
      if (classification === "paid" || classification === "overpayment") {
        const splitRows = await prisma.split.findMany({ where: { orderRef } });

        if (splitRows.length > 0) {
          // ── A. Percentage splits configured — execute each ─────────────────
          // calculateSplits always sums back to expectedKobo exactly (rounding-safe).
          const allocations = calculateSplits(expectedKobo, splitRows.map((s) => ({
            party:          s.party,
            account_number: s.accountNumber,
            bank_code:      s.bankCode,
            percentage:     s.percentage,
          })));

          for (const allocation of allocations) {
            const splitRow = splitRows.find((s) => s.party === allocation.party);
            if (!splitRow) continue;

            try {
              const { accountName } = await lookupBankAccount({
                bankCode:      allocation.bank_code,
                accountNumber: allocation.account_number,
              });

              const merchantTxRef = `split_${orderRef}_${allocation.party}_${requestId}`;

              const { transferRef, status: txStatus } = await transferToBank({
                amountKobo:    allocation.amount_kobo,
                bankCode:      allocation.bank_code,
                accountNumber: allocation.account_number,
                accountName,
                narration:     `NairaRails split — ${allocation.party} (${allocation.percentage}%)`,
                merchantTxRef,
              });

              const splitStatus = txStatus.toLowerCase() === "success" ? "executed" : "pending";

              await prisma.$transaction([
                prisma.split.update({
                  where: { id: splitRow.id },
                  data: {
                    status:           splitStatus,
                    amountKobo:       BigInt(allocation.amount_kobo),
                    nombaTransferRef: transferRef,
                  },
                }),
                prisma.ledgerEntry.create({
                  data: {
                    orderRef,
                    entryType:  "split_payout",
                    amountKobo: BigInt(-allocation.amount_kobo),
                    reference:  transferRef,
                    narration:  `Split to ${allocation.party}: ${allocation.amount_kobo} kobo (${allocation.percentage}%)`,
                  },
                }),
              ]);

              logger.info(
                { orderRef, party: allocation.party, amountKobo: allocation.amount_kobo, transferRef, splitStatus },
                `Split ${splitStatus === "executed" ? "executed" : "initiated (pending confirmation)"}`
              );
            } catch (splitErr) {
              await prisma.split.update({
                where: { id: splitRow.id },
                data:  { status: "failed" },
              }).catch(() => {});

              logger.error(
                { orderRef, party: allocation.party, err: splitErr },
                "Split execution failed — marked as failed, manual retry required"
              );
            }
          }
        } else {
          // ── B. No splits — auto-settle to merchant's settlement account ────
          // Fetch the merchant's settlement account details.
          const merchantRecord = await prisma.merchant.findUnique({
            where:  { id: order.merchantId },
            select: { settlementAccountNumber: true, settlementBankCode: true, name: true },
          });

          const settlementAccount = merchantRecord?.settlementAccountNumber;
          const settlementBank    = merchantRecord?.settlementBankCode;

          if (settlementAccount && settlementBank) {
            try {
              const { accountName } = await lookupBankAccount({
                bankCode:      settlementBank,
                accountNumber: settlementAccount,
              });

              const merchantTxRef = `settlement_${orderRef}_${requestId}`;

              const { transferRef, status: txStatus } = await transferToBank({
                amountKobo:    expectedKobo,
                bankCode:      settlementBank,
                accountNumber: settlementAccount,
                accountName,
                narration:     `NairaRails settlement — ${orderRef}`,
                merchantTxRef,
              });

              const settlementStatus = txStatus.toLowerCase() === "success" ? "executed" : "pending";

              await prisma.ledgerEntry.create({
                data: {
                  orderRef,
                  entryType:  "split_payout",
                  amountKobo: BigInt(-expectedKobo),
                  reference:  transferRef,
                  narration:  `Settlement to merchant account: ${expectedKobo} kobo (${settlementStatus})`,
                },
              });

              logger.info(
                { orderRef, settlementAccount, expectedKobo, transferRef, settlementStatus },
                `Full settlement ${settlementStatus === "executed" ? "executed" : "initiated (pending)"}`
              );
            } catch (settleErr) {
              // Log and continue — order is still classified as paid, settlement can be retried manually
              logger.error(
                { orderRef, settlementAccount, err: settleErr },
                "Settlement transfer failed — order marked paid, manual transfer required"
              );
            }
          } else {
            // No settlement account configured — funds stay in the Nomba sub-account
            logger.warn(
              { orderRef, merchantId: order.merchantId },
              "No splits and no settlement account configured — funds remain in Nomba sub-account. Merchant should set a settlement account in Settings."
            );
          }
        }
      }
    }

    // ── 8. Always respond 200 ─────────────────────────────────────────────────
    // Respond 200 once the event is safely recorded — Nomba will not retry.
    res.status(200).json({
      status:        "ok",
      requestId,
      transactionId: txn.transactionId,
      timestamp:     new Date().toISOString(),
    });
  }
);

export { router as webhookRouter };
