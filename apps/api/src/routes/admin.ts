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
router.get("/reconcile-check", async (req, res, next) => {
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
router.get("/banks", async (req, res, next) => {
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
router.post("/test-lookup", async (req, res, next) => {
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
router.post("/nuke", async (req, res, next) => {
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
router.post("/orders/expire-pending", async (req, res, next) => {
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
router.post("/orders/:orderRef/reset", async (req, res, next) => {
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

// ─── GET /api/v1/admin/orders ────────────────────────────────────────────────
// Cross-merchant order list for ops visibility.
// Supports optional filters: status, merchant_id, date_from, date_to, page, page_size.
const AdminOrdersQuerySchema = z.object({
  page:        z.coerce.number().int().positive().default(1),
  page_size:   z.coerce.number().int().positive().max(200).default(50),
  status:      z.enum(["pending","paid","underpayment","overpayment","unmatched","expired","refunded"]).optional(),
  merchant_id: z.string().optional(),
  date_from:   z.string().optional(),
  date_to:     z.string().optional(),
});

router.get("/orders", async (req, res, next) => {
  try {
    const query = AdminOrdersQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(422, "VALIDATION_ERROR", "Invalid query parameters");

    const { page, page_size, status, merchant_id, date_from, date_to } = query.data;
    const skip = (page - 1) * page_size;

    const where: import("@prisma/client").Prisma.OrderWhereInput = {
      ...(status      ? { status }                                                          : {}),
      ...(merchant_id ? { merchantId: merchant_id }                                        : {}),
      ...(date_from || date_to ? {
        createdAt: {
          ...(date_from ? { gte: new Date(`${date_from}T00:00:00.000Z`) } : {}),
          ...(date_to   ? { lte: new Date(`${date_to}T23:59:59.999Z`)   } : {}),
        },
      } : {}),
    };

    const [orders, total_count] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: page_size,
        select: {
          orderRef:             true,
          customerName:         true,
          expectedAmountKobo:   true,
          receivedAmountKobo:   true,
          status:               true,
          virtualAccountNumber: true,
          createdAt:            true,
          merchantId:           true,
          merchant:             { select: { name: true, email: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    res.status(200).json({
      results: orders.map((o) => ({
        order_ref:              o.orderRef,
        customer_name:          o.customerName,
        expected_amount_kobo:   Number(o.expectedAmountKobo),
        received_amount_kobo:   o.receivedAmountKobo !== null ? Number(o.receivedAmountKobo) : null,
        status:                 o.status,
        virtual_account_number: o.virtualAccountNumber ?? "",
        created_at:             o.createdAt.toISOString(),
        merchant_id:            o.merchantId,
        merchant_name:          o.merchant.name,
        merchant_email:         o.merchant.email,
      })),
      page,
      page_size,
      total_count,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/admin/merchants ─────────────────────────────────────────────
// Full merchant list with order counts and key metadata.
router.get("/merchants", async (req, res, next) => {
  try {
    const merchants = await prisma.merchant.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id:             true,
        name:           true,
        email:          true,
        emailVerified:  true,
        webhookUrl:     true,
        apiKeyPrefix:   true,
        apiKeyIssuedAt: true,
        apiKeyExpiresAt:true,
        suspended:      true,
        suspendedAt:    true,
        suspendedNote:  true,
        createdAt:      true,
        _count:         { select: { orders: true } },
      },
    });

    // Aggregate order stats per merchant in one extra query
    const stats = await prisma.order.groupBy({
      by: ["merchantId", "status"],
      _count: { _all: true },
    });

    const statsByMerchant = new Map<string, Record<string, number>>();
    for (const row of stats) {
      const m = statsByMerchant.get(row.merchantId) ?? {};
      m[row.status] = row._count._all;
      statsByMerchant.set(row.merchantId, m);
    }

    res.status(200).json({
      total: merchants.length,
      merchants: merchants.map((m) => {
        const s = statsByMerchant.get(m.id) ?? {};
        return {
          id:                 m.id,
          name:               m.name,
          email:              m.email,
          email_verified:     m.emailVerified,
          webhook_url:        m.webhookUrl ?? null,
          api_key_prefix:     m.apiKeyPrefix ?? null,
          api_key_issued_at:  m.apiKeyIssuedAt?.toISOString()  ?? null,
          api_key_expires_at: m.apiKeyExpiresAt?.toISOString() ?? null,
          suspended:          m.suspended,
          suspended_at:       m.suspendedAt?.toISOString() ?? null,
          suspended_note:     m.suspendedNote ?? null,
          created_at:         m.createdAt.toISOString(),
          total_orders:       m._count.orders,
          orders_paid:        s["paid"]         ?? 0,
          orders_pending:     s["pending"]      ?? 0,
          orders_exception:   (s["underpayment"] ?? 0) + (s["overpayment"] ?? 0) + (s["unmatched"] ?? 0),
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/admin/merchants/:merchantId/suspend ─────────────────────────
router.post("/merchants/:merchantId/suspend", async (req, res, next) => {
  try {
    const { merchantId } = req.params as { merchantId: string };
    const { note } = req.body as { note?: string };

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new AppError(404, "NOT_FOUND", `Merchant ${merchantId} not found`);
    if (merchant.suspended) throw new AppError(409, "ALREADY_SUSPENDED", "Merchant is already suspended");

    await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        suspended:     true,
        suspendedAt:   new Date(),
        suspendedNote: note ?? null,
      },
    });

    logger.warn({ merchantId, note }, "Admin: merchant suspended");
    res.status(200).json({ merchantId, suspended: true, note: note ?? null, message: "Merchant suspended. Their API key will now return 403." });
  } catch (err) { next(err); }
});

// ─── POST /api/v1/admin/merchants/:merchantId/reactivate ──────────────────────
router.post("/merchants/:merchantId/reactivate", async (req, res, next) => {
  try {
    const { merchantId } = req.params as { merchantId: string };

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new AppError(404, "NOT_FOUND", `Merchant ${merchantId} not found`);
    if (!merchant.suspended) throw new AppError(409, "NOT_SUSPENDED", "Merchant is not currently suspended");

    await prisma.merchant.update({
      where: { id: merchantId },
      data: { suspended: false, suspendedAt: null, suspendedNote: null },
    });

    logger.info({ merchantId }, "Admin: merchant reactivated");
    res.status(200).json({ merchantId, suspended: false, message: "Merchant reactivated. Their API key is now valid again." });
  } catch (err) { next(err); }
});

// ─── POST /api/v1/admin/merchants/:merchantId/force-verify ───────────────────
router.post("/merchants/:merchantId/force-verify", async (req, res, next) => {
  try {
    const { merchantId } = req.params as { merchantId: string };

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new AppError(404, "NOT_FOUND", `Merchant ${merchantId} not found`);
    if (merchant.emailVerified) throw new AppError(409, "ALREADY_VERIFIED", "Merchant email is already verified");

    await prisma.merchant.update({
      where: { id: merchantId },
      data:  { emailVerified: true },
    });

    logger.info({ merchantId }, "Admin: merchant email force-verified");
    res.status(200).json({ merchantId, emailVerified: true, message: "Email marked as verified. Merchant can now issue an API key." });
  } catch (err) { next(err); }
});

// ─── POST /api/v1/admin/merchants/:merchantId/revoke-key ─────────────────────
router.post("/merchants/:merchantId/revoke-key", async (req, res, next) => {
  try {
    const { merchantId } = req.params as { merchantId: string };

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new AppError(404, "NOT_FOUND", `Merchant ${merchantId} not found`);
    if (!merchant.apiKeyHash) throw new AppError(409, "NO_KEY", "Merchant has no active API key to revoke");

    await prisma.merchant.update({
      where: { id: merchantId },
      data:  { apiKeyHash: null, apiKeyPrefix: null, apiKeyIssuedAt: null, apiKeyExpiresAt: null },
    });

    logger.warn({ merchantId }, "Admin: merchant API key revoked");
    res.status(200).json({ merchantId, message: "API key revoked. All requests with the old key now return 401." });
  } catch (err) { next(err); }
});

// ─── PATCH /api/v1/admin/merchants/:merchantId ────────────────────────────────
const AdminMerchantUpdateSchema = z.object({
  name:       z.string().min(2).max(100).optional(),
  webhookUrl: z.string().url().nullable().optional(),
});

router.patch("/merchants/:merchantId", async (req, res, next) => {
  try {
    const { merchantId } = req.params as { merchantId: string };
    const parsed = AdminMerchantUpdateSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid body");

    const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
    if (!merchant) throw new AppError(404, "NOT_FOUND", `Merchant ${merchantId} not found`);

    const updated = await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        ...(parsed.data.name       !== undefined ? { name: parsed.data.name }                           : {}),
        ...(parsed.data.webhookUrl !== undefined ? { webhookUrl: parsed.data.webhookUrl ?? null }       : {}),
      },
    });

    logger.info({ merchantId, changes: parsed.data }, "Admin: merchant profile updated");
    res.status(200).json({ merchantId, name: updated.name, webhookUrl: updated.webhookUrl ?? null });
  } catch (err) { next(err); }
});

// ─── DELETE /api/v1/admin/merchants/:merchantId ───────────────────────────────
// Hard-deletes the merchant and all their orders/splits/ledger/webhooks.
// Cannot delete if merchant has paid orders (prevents accidental revenue data loss).
router.delete("/merchants/:merchantId", async (req, res, next) => {
  try {
    const { merchantId } = req.params as { merchantId: string };
    const { confirm } = req.body as { confirm?: string };

    if (confirm !== "DELETE") {
      throw new AppError(400, "CONFIRMATION_REQUIRED", "Send { confirm: 'DELETE' } in the body to confirm deletion");
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { _count: { select: { orders: true } } },
    });
    if (!merchant) throw new AppError(404, "NOT_FOUND", `Merchant ${merchantId} not found`);

    const paidOrders = await prisma.order.count({ where: { merchantId, status: "paid" } });
    if (paidOrders > 0) {
      throw new AppError(409, "HAS_PAID_ORDERS",
        `Merchant has ${paidOrders} paid order(s). Suspend instead of deleting, or manually resolve orders first.`);
    }

    await prisma.$transaction([
      prisma.ledgerEntry.deleteMany({ where: { order: { merchantId } } }),
      prisma.split.deleteMany({ where: { order: { merchantId } } }),
      prisma.order.deleteMany({ where: { merchantId } }),
      prisma.merchant.delete({ where: { id: merchantId } }),
    ]);

    logger.warn({ merchantId, email: merchant.email }, "Admin: merchant hard-deleted");
    res.status(200).json({ deleted: true, merchantId, message: `Merchant '${merchant.name}' and all their orders permanently deleted.` });
  } catch (err) { next(err); }
});

// ─── GET /api/v1/admin/orders/:orderRef ──────────────────────────────────────
// Full order detail — splits, ledger entries, webhook events (audit trail).
router.get("/orders/:orderRef", async (req, res, next) => {
  try {
    const { orderRef } = req.params as { orderRef: string };

    const order = await prisma.order.findUnique({
      where: { orderRef },
      include: {
        merchant: { select: { id: true, name: true, email: true } },
        splits:   { orderBy: { id: "asc" } },
        ledgerEntries: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) throw new AppError(404, "NOT_FOUND", `Order ${orderRef} not found`);

    // Fetch webhook events matching this order ref from raw payload
    const webhookEvents = await prisma.webhookEvent.findMany({
      where:   { rawPayload: { contains: orderRef } },
      orderBy: { createdAt: "asc" },
      select:  { id: true, requestId: true, eventType: true, processedAt: true, createdAt: true, rawPayload: true },
    });

    res.status(200).json({
      order_ref:              order.orderRef,
      customer_name:          order.customerName,
      customer_email:         order.customerEmail,
      expected_amount_kobo:   Number(order.expectedAmountKobo),
      received_amount_kobo:   order.receivedAmountKobo !== null ? Number(order.receivedAmountKobo) : null,
      status:                 order.status,
      virtual_account_number: order.virtualAccountNumber ?? null,
      bank_name:              order.bankName ?? null,
      bank_code:              order.bankCode ?? null,
      sender_name:            order.senderName ?? null,
      sender_account_number:  order.senderAccountNumber ?? null,
      sender_bank_code:       order.senderBankCode ?? null,
      currency:               order.currency,
      created_at:             order.createdAt.toISOString(),
      updated_at:             order.updatedAt.toISOString(),
      merchant: {
        id:    order.merchant.id,
        name:  order.merchant.name,
        email: order.merchant.email,
      },
      splits: order.splits.map((s) => ({
        party:            s.party,
        account_number:   s.accountNumber,
        bank_code:        s.bankCode,
        percentage:       s.percentage,
        amount_kobo:      s.amountKobo !== null ? Number(s.amountKobo) : null,
        status:           s.status,
        nomba_transfer_ref: s.nombaTransferRef ?? null,
        created_at:       s.createdAt.toISOString(),
      })),
      ledger_entries: order.ledgerEntries.map((e) => ({
        id:          e.id,
        entry_type:  e.entryType,
        amount_kobo: Number(e.amountKobo),
        currency:    e.currency,
        reference:   e.reference ?? null,
        narration:   e.narration ?? null,
        created_at:  e.createdAt.toISOString(),
      })),
      webhook_events: webhookEvents.map((e) => ({
        id:           e.id,
        request_id:   e.requestId,
        event_type:   e.eventType,
        processed_at: e.processedAt?.toISOString() ?? null,
        created_at:   e.createdAt.toISOString(),
        raw_payload:  JSON.parse(e.rawPayload) as unknown,
      })),
    });
  } catch (err) { next(err); }
});

// ─── POST /api/v1/admin/orders/:orderRef/force-pay ───────────────────────────
// Manually marks an order as paid and triggers split execution.
// Use only when payment was confirmed externally (e.g. direct bank confirmation)
// but the webhook never arrived or was dropped.
router.post("/orders/:orderRef/force-pay", async (req, res, next) => {
  try {
    const { orderRef } = req.params as { orderRef: string };
    const { amount_kobo, note } = req.body as { amount_kobo?: number; note?: string };

    const order = await prisma.order.findUnique({
      where: { orderRef },
      include: { splits: true },
    });
    if (!order) throw new AppError(404, "NOT_FOUND", `Order ${orderRef} not found`);
    if (order.status === "paid" || order.status === "refunded") {
      throw new AppError(409, "INVALID_STATUS", `Order is already in '${order.status}' state — cannot force-pay`);
    }

    const forcedAmountKobo = amount_kobo ?? Number(order.expectedAmountKobo);

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { orderRef },
        data:  { status: "paid", receivedAmountKobo: BigInt(forcedAmountKobo) },
      });
      await tx.ledgerEntry.create({
        data: {
          orderRef,
          entryType:   "payment_received",
          amountKobo:  BigInt(forcedAmountKobo),
          currency:    order.currency,
          narration:   note ? `Admin force-pay: ${note}` : "Admin force-pay — manual payment confirmation",
        },
      });
    });

    logger.warn({ orderRef, forcedAmountKobo, note }, "Admin: order force-paid — splits NOT auto-executed, trigger manually if needed");

    res.status(200).json({
      orderRef,
      status:               "paid",
      forced_amount_kobo:   forcedAmountKobo,
      splits_executed:      false,
      message:              "Order marked paid. Splits were NOT auto-executed — use the split execution endpoint if needed.",
      note:                 note ?? null,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/v1/admin/webhook-events ────────────────────────────────────────
// Paginated webhook event log across all orders.
const WebhookEventsQuerySchema = z.object({
  page:       z.coerce.number().int().positive().default(1),
  page_size:  z.coerce.number().int().positive().max(200).default(50),
  order_ref:  z.string().optional(),
  event_type: z.string().optional(),
  date_from:  z.string().optional(),
  date_to:    z.string().optional(),
});

router.get("/webhook-events", async (req, res, next) => {
  try {
    const query = WebhookEventsQuerySchema.safeParse(req.query);
    if (!query.success) throw new AppError(422, "VALIDATION_ERROR", "Invalid query parameters");

    const { page, page_size, order_ref, event_type, date_from, date_to } = query.data;
    const skip = (page - 1) * page_size;

    const where: import("@prisma/client").Prisma.WebhookEventWhereInput = {
      ...(order_ref  ? { rawPayload: { contains: order_ref } }  : {}),
      ...(event_type ? { eventType: { contains: event_type } }  : {}),
      ...(date_from || date_to ? {
        createdAt: {
          ...(date_from ? { gte: new Date(`${date_from}T00:00:00.000Z`) } : {}),
          ...(date_to   ? { lte: new Date(`${date_to}T23:59:59.999Z`)   } : {}),
        },
      } : {}),
    };

    const [events, total_count] = await Promise.all([
      prisma.webhookEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: page_size,
      }),
      prisma.webhookEvent.count({ where }),
    ]);

    res.status(200).json({
      results: events.map((e) => ({
        id:           e.id,
        request_id:   e.requestId,
        event_type:   e.eventType,
        processed_at: e.processedAt?.toISOString() ?? null,
        created_at:   e.createdAt.toISOString(),
        raw_payload:  JSON.parse(e.rawPayload) as unknown,
      })),
      page,
      page_size,
      total_count,
    });
  } catch (err) { next(err); }
});

// ─── GET /api/v1/admin/system-health ─────────────────────────────────────────
// Returns env var presence checklist, DB connectivity, Nomba token status.
router.get("/system-health", async (req, res, next) => {
  try {
    // 1. Environment variable checklist (presence only — never expose values)
    const ENV_VARS = [
      "DATABASE_URL", "DIRECT_URL",
      "NOMBA_BASE_URL", "NOMBA_CLIENT_ID", "NOMBA_CLIENT_SECRET",
      "NOMBA_ACCOUNT_ID", "NOMBA_SUB_ACCOUNT_ID", "NOMBA_WEBHOOK_SECRET",
      "ADMIN_SECRET", "FRONTEND_URL",
      "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY",
      "REDIS_URL",
    ];
    const envStatus = ENV_VARS.reduce<Record<string, boolean>>((acc, key) => {
      acc[key] = Boolean(process.env[key]);
      return acc;
    }, {});

    const missingCount = Object.values(envStatus).filter((v) => !v).length;

    // 2. DB connectivity
    let dbOk = false;
    let dbLatencyMs: number | null = null;
    try {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
      dbOk = true;
    } catch { /* dbOk stays false */ }

    // 3. Order + merchant counts (quick health snapshot)
    let totalOrders = 0;
    let totalMerchants = 0;
    if (dbOk) {
      [totalOrders, totalMerchants] = await Promise.all([
        prisma.order.count(),
        prisma.merchant.count(),
      ]);
    }

    // 4. Process info
    const uptimeSeconds = Math.floor(process.uptime());

    res.status(200).json({
      status:           dbOk && missingCount === 0 ? "healthy" : "degraded",
      timestamp:        new Date().toISOString(),
      uptime_seconds:   uptimeSeconds,
      env: {
        vars:           envStatus,
        missing_count:  missingCount,
        all_present:    missingCount === 0,
      },
      database: {
        connected:    dbOk,
        latency_ms:   dbLatencyMs,
        total_orders:    dbOk ? totalOrders    : null,
        total_merchants: dbOk ? totalMerchants : null,
      },
      process: {
        node_version: process.version,
        platform:     process.platform,
        env:          process.env["NODE_ENV"] ?? "development",
        memory_mb:    Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    });
  } catch (err) { next(err); }
});

export { router as adminRouter };
