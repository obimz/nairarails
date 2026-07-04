// apps/api/src/routes/admin.ts
// Phase 6 admin/reconciliation routes.

import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { listTransactions, NombaApiError, lookupBankAccount, fetchBankCodes, expireVirtualAccount } from "../integrations/nombaClient.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../middleware/errorHandler.js";

const router: ExpressRouter = Router();

// ─── Admin auth ───────────────────────────────────────────────────────────────
// All admin routes require the x-admin-secret header to match ADMIN_SECRET env var.
// Not a substitute for real auth — this is a simple guard against accidental exposure.
router.use((req, res, next) => {
  const secret = process.env["ADMIN_SECRET"];
  if (!secret) {
    // If not configured, block all admin access rather than leave it open.
    res.status(503).json({ error: "Admin secret not configured on this server" });
    return;
  }
  if (req.headers["x-admin-secret"] !== secret) {
    res.status(401).json({ error: "Invalid or missing x-admin-secret header" });
    return;
  }
  next();
});

// ─── Query schema ─────────────────────────────────────────────────────────────
const ReconcileQuerySchema = z.object({
  // Default to today if not provided
  date_from: z.string().optional(),
  date_to:   z.string().optional(),
});

// ─── GET /api/v1/admin/reconcile-check ───────────────────────────────────────
// Pulls Nomba's /transactions for a date range, diffs against local
// ledger_entries by reference (= Nomba transactionId), and surfaces drift.
//
// Three categories of drift:
//   orphans  — on Nomba but no matching ledger_entry in our DB (missed processing)
//   drift    — amount in our DB doesn't match Nomba's amount
//   matched  — count of clean matches (informational)
router.get("/admin/reconcile-check", async (req, res, next) => {
  try {
    const query = ReconcileQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new AppError(422, "VALIDATION_ERROR", "Invalid query parameters");
    }

    // Default date range: today UTC
    const today     = new Date().toISOString().split("T")[0] as string;
    const date_from = query.data.date_from ?? today;
    const date_to   = query.data.date_to   ?? today;

    logger.info({ date_from, date_to }, "Reconcile check started");

    // ── 1. Fetch Nomba transactions for the period ───────────────────────────
    let transactions: Awaited<ReturnType<typeof listTransactions>>["transactions"] = [];
    let totalCount = 0;
    try {
      const result = await listTransactions({
        dateFrom: date_from,
        dateTo:   date_to,
        status:   "success",
      });
      transactions = result.transactions;
      totalCount   = result.totalCount;
    } catch (nombaErr) {
      // Surface Nomba API errors as a structured 502 rather than a raw 500 —
      // the endpoint is still useful for local ledger inspection even when
      // Nomba's /transactions is unavailable (e.g. sandbox limitations).
      if (nombaErr instanceof NombaApiError) {
        logger.warn(
          { status: nombaErr.status, body: nombaErr.body },
          "Nomba /transactions call failed — returning local ledger summary only"
        );
        return res.status(502).json({
          error: {
            code:    "NOMBA_API_ERROR",
            message: `Nomba /transactions returned ${nombaErr.status}: ${nombaErr.message}`,
          },
        });
      }
      throw nombaErr;
    }

    if (transactions.length === 0) {
      return res.status(200).json({
        checked_at:    new Date().toISOString(),
        date_from,
        date_to,
        total_checked: 0,
        matched:       0,
        orphans:       [],
        drift:         [],
        summary:       "No Nomba transactions found for this period",
      });
    }

    // ── 2. Fetch our local ledger entries for the same period ────────────────
    // Ledger entries store the Nomba transactionId in the `reference` column.
    const periodStart = new Date(`${date_from}T00:00:00.000Z`);
    const periodEnd   = new Date(`${date_to}T23:59:59.999Z`);

    const localEntries = await prisma.ledgerEntry.findMany({
      where: {
        createdAt: { gte: periodStart, lte: periodEnd },
        reference: { not: null },
      },
      select: {
        reference:   true,
        amountKobo:  true,
        orderRef:    true,
        entryType:   true,
      },
    });

    // Index local entries by reference for O(1) lookup.
    const localByRef = new Map(
      localEntries.map((e) => [e.reference, e])
    );

    // ── 3. Diff Nomba vs local ────────────────────────────────────────────────
    const orphans:  Array<{ transactionId: string; merchantTxRef: string; amount_kobo: number; created_at: string }> = [];
    const drift:    Array<{ transactionId: string; merchantTxRef: string; nomba_amount_kobo: number; local_amount_kobo: number; order_ref: string }> = [];
    let   matched = 0;

    for (const tx of transactions) {
      const local = localByRef.get(tx.transactionId);

      if (!local) {
        // On Nomba but not in our ledger — potential missed webhook.
        orphans.push({
          transactionId: tx.transactionId,
          merchantTxRef: tx.merchantTxRef,
          amount_kobo:   tx.amount,
          created_at:    tx.createdAt,
        });
        continue;
      }

      const localKobo = Math.abs(Number(local.amountKobo));
      if (localKobo !== tx.amount) {
        // Amount mismatch between Nomba and our DB.
        drift.push({
          transactionId:     tx.transactionId,
          merchantTxRef:     tx.merchantTxRef,
          nomba_amount_kobo: tx.amount,
          local_amount_kobo: localKobo,
          order_ref:         local.orderRef,
        });
        continue;
      }

      matched++;
    }

    logger.info(
      { total: transactions.length, matched, orphans: orphans.length, drift: drift.length },
      "Reconcile check complete"
    );

    return res.status(200).json({
      checked_at:    new Date().toISOString(),
      date_from,
      date_to,
      total_checked: totalCount,
      matched,
      orphans,
      drift,
    });
  } catch (err) {
    return next(err);
  }
});

// ─── GET /api/v1/admin/banks ──────────────────────────────────────────────────
// Proxies Nomba's bank code list. Call this to find the correct bankCode
// for any Nigerian bank before creating an order with split recipients.
router.get("/admin/banks", async (req, res, next) => {
  try {
    const banks = await fetchBankCodes();
    return res.status(200).json({ count: banks.length, banks });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /api/v1/admin/test-lookup ──────────────────────────────────────────
// Calls Nomba's bank account lookup directly so you can verify a bankCode +
// accountNumber combination resolves before using it in a real order split.
// Use this to debug "Resource not found" errors without triggering a payment.
router.post("/admin/test-lookup", async (req, res, next) => {
  try {
    const { bankCode, accountNumber } = req.body as { bankCode: string; accountNumber: string };
    if (!bankCode || !accountNumber) {
      return res.status(400).json({ error: "bankCode and accountNumber are required" });
    }

    const result = await lookupBankAccount({ bankCode, accountNumber });
    return res.status(200).json({ bankCode, accountNumber, accountName: result.accountName });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /api/v1/admin/nuke ──────────────────────────────────────────────────
// DANGER: Deletes ALL orders, splits, ledger entries, and webhook events.
// Also expires all virtual accounts on Nomba's side so they stop accepting payments.
// Does NOT touch merchants.
router.post("/admin/nuke", async (req, res, next) => {
  try {
    // Collect all order refs + VA numbers before wiping the DB.
    const orders = await prisma.order.findMany({
      select: { orderRef: true, virtualAccountNumber: true },
    });

    await prisma.$transaction([
      prisma.ledgerEntry.deleteMany(),
      prisma.split.deleteMany(),
      prisma.webhookEvent.deleteMany(),
      prisma.order.deleteMany(),
    ]);

    logger.warn("Admin nuke: ALL orders and related data deleted");

    // Best-effort expire each VA on Nomba's side — don't fail the nuke if Nomba errors.
    const expireResults = await Promise.allSettled(
      orders
        .filter((o) => o.virtualAccountNumber) // only if VA was actually created
        .map((o) => expireVirtualAccount(o.orderRef))
    );

    const expired  = expireResults.filter((r) => r.status === "fulfilled").length;
    const failed   = expireResults.filter((r) => r.status === "rejected").length;

    return res.status(200).json({
      status:            "nuked",
      orders_deleted:    orders.length,
      nomba_vas_expired: expired,
      nomba_expire_failed: failed,
      message: "All local orders deleted. Virtual accounts expired on Nomba where possible.",
    });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /api/v1/admin/orders/expire-pending ─────────────────────────────────
// Marks all `pending` orders as `expired`.
//
// Use this to clean up orders whose virtual accounts have already expired
// without receiving a payment. Accepts an optional `order_refs` array in the
// body to target specific orders, or marks ALL pending orders if omitted.
//
// Does NOT touch ledger entries or splits — there's nothing to unwind since
// no payment was ever received.
router.post("/admin/orders/expire-pending", async (req, res, next) => {
  try {
    const body = req.body as { order_refs?: string[] } | undefined;
    const orderRefs: string[] | undefined = body?.order_refs;

    const where =
      orderRefs && orderRefs.length > 0
        ? { status: "pending" as const, orderRef: { in: orderRefs } }
        : { status: "pending" as const };

    // Collect VA refs before updating.
    const ordersToExpire = await prisma.order.findMany({
      where,
      select: { orderRef: true, virtualAccountNumber: true },
    });

    const { count } = await prisma.order.updateMany({
      where,
      data: { status: "expired" },
    });

    logger.warn(
      { count, targeted: orderRefs ?? "all_pending" },
      "Admin bulk expire: pending orders marked expired"
    );

    // Best-effort expire each VA on Nomba's side.
    const expireResults = await Promise.allSettled(
      ordersToExpire
        .filter((o) => o.virtualAccountNumber)
        .map((o) => expireVirtualAccount(o.orderRef))
    );

    const nombaExpired = expireResults.filter((r) => r.status === "fulfilled").length;
    const nombaFailed  = expireResults.filter((r) => r.status === "rejected").length;

    return res.status(200).json({
      expired_count:       count,
      nomba_vas_expired:   nombaExpired,
      nomba_expire_failed: nombaFailed,
      message: `${count} order(s) marked as expired. ${nombaExpired} VA(s) expired on Nomba.`,
    });
  } catch (err) {
    return next(err);
  }
});

// ─── POST /api/v1/admin/orders/:orderRef/reset ────────────────────────────────
// Resets a single order back to `pending` and wipes the bad receivedAmountKobo
// so the next real webhook can re-classify it from scratch.
//
// Also deletes the webhook_event row(s) tied to this order so idempotency doesn't
// block re-processing of the same requestId, and removes any ledger entries and
// split records written during the bad classification.
//
// USE ONLY to correct a known bug (e.g. the naira/kobo unit mismatch that caused
// a 100 ₦ payment to be classified as an underpayment). Not a general-purpose tool.
router.post("/admin/orders/:orderRef/reset", async (req, res, next) => {
  try {
    const { orderRef } = req.params as { orderRef: string };

    const order = await prisma.order.findUnique({ where: { orderRef } });
    if (!order) {
      throw new AppError(404, "NOT_FOUND", `Order ${orderRef} not found`);
    }

    logger.warn({ orderRef, currentStatus: order.status }, "Admin order reset initiated");

    await prisma.$transaction(async (tx) => {
      // 1. Wipe ledger entries for this order (the bad payment_received + any
      //    failed split_payout rows written during the buggy webhook).
      await tx.ledgerEntry.deleteMany({ where: { orderRef } });

      // 2. Reset all split rows back to pending and clear any payout amounts.
      await tx.split.updateMany({
        where: { orderRef },
        data:  { status: "pending", amountKobo: null, nombaTransferRef: null },
      });

      // 3. Delete the webhook_event row(s) associated with this order so
      //    idempotency doesn't prevent re-processing the same requestId.
      //    We identify them by matching orderRef inside the raw JSON payload.
      //    Belt-and-braces: also delete any event whose rawPayload contains the orderRef.
      const events = await tx.webhookEvent.findMany({
        where: { rawPayload: { contains: orderRef } },
        select: { id: true, requestId: true },
      });
      if (events.length > 0) {
        await tx.webhookEvent.deleteMany({
          where: { id: { in: events.map((e) => e.id) } },
        });
        logger.info(
          { orderRef, deletedRequestIds: events.map((e) => e.requestId) },
          "Webhook event rows removed for order reset"
        );
      }

      // 4. Reset the order itself.
      await tx.order.update({
        where: { orderRef },
        data: {
          status:              "pending",
          receivedAmountKobo:  null,
          senderName:          null,
          senderAccountNumber: null,
          senderBankCode:      null,
        },
      });
    });

    logger.warn({ orderRef }, "Admin order reset complete — order back to pending");

    // Best-effort expire the VA on Nomba's side — the order gets a fresh VA on next payment attempt.
    if (order.virtualAccountNumber) {
      try {
        await expireVirtualAccount(orderRef);
        logger.info({ orderRef }, "Nomba virtual account expired as part of order reset");
      } catch (expireErr) {
        logger.warn({ orderRef, err: expireErr }, "Could not expire Nomba VA during reset — continuing");
      }
    }

    return res.status(200).json({
      orderRef,
      status:  "reset_to_pending",
      message: "Order reset. Virtual account expired on Nomba. Re-create the order to get a fresh VA.",
    });
  } catch (err) {
    return next(err);
  }
});

export { router as adminRouter };
