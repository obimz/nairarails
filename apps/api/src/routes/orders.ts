import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { CreateOrderRequestSchema } from "@nairarails/shared-types";
import { calculateSplits, shortfallKobo, excessKobo } from "@nairarails/webhook-core";
import { validate } from "../middleware/validate.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { AppError } from "../middleware/errorHandler.js";
import { prisma } from "../db/client.js";
import { createVirtualAccount } from "../integrations/nombaClient.js";
import { validateSplitBankCodes } from "../lib/bankValidator.js";
import { logger } from "../lib/logger.js";

const router: ExpressRouter = Router();

// ─── Query schema for GET /orders ─────────────────────────────────────────────
const ListOrdersQuerySchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status:    z.enum(["pending", "paid", "underpayment", "overpayment", "unmatched", "expired"]).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_from must be YYYY-MM-DD").optional(),
  date_to:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_to must be YYYY-MM-DD").optional(),
});

// ─── POST /api/v1/orders ──────────────────────────────────────────────────────
// Phase 15: apiKeyAuth required — merchantId comes from res.locals.merchant.id
router.post(
  "/orders",
  apiKeyAuth,
  validate(CreateOrderRequestSchema),
  async (req, res, next) => {
    try {
      const merchant = res.locals.merchant;
      const { order_ref, customer_name, customer_email, expected_amount_kobo, currency, splits } =
        req.body as import("@nairarails/shared-types").CreateOrderRequest;

      // Step 0: Validate all split bank codes against Nomba's supported list.
      // Fail fast here so the merchant gets a clear error before any DB writes
      // or Nomba calls are made.
      const bankErrors = validateSplitBankCodes(splits);
      if (bankErrors.length > 0) {
        throw new AppError(422, "INVALID_BANK_CODE", bankErrors[0]!);
      }

      // Step 1: Insert order + splits atomically.
      // Nomba call is intentionally OUTSIDE this transaction — if the VA call
      // fails we still have the DB rows and can retry without duplicating data.
      await prisma.$transaction(async (tx) => {
        const existing = await tx.order.findUnique({ where: { orderRef: order_ref } });
        if (existing) {
          throw new AppError(409, "DUPLICATE_ORDER_REF", `Order ref '${order_ref}' already exists`);
        }

        await tx.order.create({
          data: {
            orderRef:           order_ref,
            merchantId:         merchant.id,         // ← Phase 15: per-merchant FK
            customerName:       customer_name,
            customerEmail:      customer_email ?? null,
            expectedAmountKobo: BigInt(expected_amount_kobo),
            currency,
            status:             "pending",
          },
        });

        await tx.split.createMany({
          data: splits.map((s) => ({
            orderRef:      order_ref,
            party:         s.party,
            accountNumber: s.account_number,
            bankCode:      s.bank_code,
            percentage:    s.percentage,
            status:        "pending" as const,
          })),
        });
      });

      // Step 2: Create the virtual account on Nomba.
      // accountRef = order_ref so aliasAccountReference in the webhook maps
      // back to this order with no secondary lookup.
      let va: Awaited<ReturnType<typeof createVirtualAccount>>;
      try {
        va = await createVirtualAccount({
          accountRef:         order_ref,
          accountName:        customer_name,
          expectedAmountKobo: expected_amount_kobo,
        });
      } catch (nombaErr) {
        // Clean up the DB rows so this order_ref can be retried cleanly.
        await prisma.order.delete({ where: { orderRef: order_ref } }).catch(() => {
          // Best-effort — if delete fails, the orphaned row will be caught by
          // the duplicate check on the next attempt.
        });
        logger.error({ order_ref, err: nombaErr }, "Nomba VA creation failed — DB order rolled back");
        throw nombaErr;
      }

      // Step 3: Store the NUBAN back on the order row.
      const order = await prisma.order.update({
        where: { orderRef: order_ref },
        data: {
          virtualAccountNumber: va.accountNumber,
          bankName:             va.bankName,
          bankCode:             va.bankCode,
        },
      });

      const allocations = calculateSplits(expected_amount_kobo, splits);
      logger.info(
        { order_ref, merchantId: merchant.id, nuban: va.accountNumber, expected_amount_kobo, allocations },
        "Order created with virtual account"
      );

      res.status(201).json({
        order_ref:              order.orderRef,
        virtual_account_number: order.virtualAccountNumber ?? va.accountNumber,
        bank_name:              order.bankName              ?? va.bankName,
        bank_code:              order.bankCode              ?? va.bankCode,
        expected_amount_kobo:   Number(order.expectedAmountKobo),
        currency:               order.currency,
        status:                 order.status,
        created_at:             order.createdAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/orders ───────────────────────────────────────────────────────
// Phase 15: filtered to the calling merchant's orders only
router.get("/orders", apiKeyAuth, async (req, res, next) => {
  try {
    const merchant = res.locals.merchant;

    const query = ListOrdersQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new AppError(422, "VALIDATION_ERROR", "Invalid query parameters");
    }
    const { page, page_size, status, date_from, date_to } = query.data;
    const skip = (page - 1) * page_size;

    // Always scope to the calling merchant; optionally filter by status and date.
    const where: Prisma.OrderWhereInput = {
      merchantId: merchant.id,
      ...(status ? { status: status as Prisma.EnumOrderStatusFilter } : {}),
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
      })),
      page,
      page_size,
      total_count,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/orders/:order_ref/reconciliation ─────────────────────────────
// Phase 15: 404 if order doesn't belong to the calling merchant
router.get("/orders/:order_ref/reconciliation", apiKeyAuth, async (req, res, next) => {
  try {
    const merchant = res.locals.merchant;
    const { order_ref } = req.params as { order_ref: string };

    // Fetch order + splits + ledger entries in one query.
    const order = await prisma.order.findUnique({
      where: { orderRef: order_ref },
      include: {
        splits:        { orderBy: { createdAt: "asc" } },
        ledgerEntries: { orderBy: { createdAt: "asc" } },
      },
    });

    // Treat wrong-merchant orders as 404 — don't leak other merchants' data
    if (!order || order.merchantId !== merchant.id) {
      throw new AppError(404, "ORDER_NOT_FOUND", `Order '${order_ref}' not found`);
    }

    const expected = Number(order.expectedAmountKobo);
    const received = order.receivedAmountKobo !== null ? Number(order.receivedAmountKobo) : null;
    const splitsExecuted = order.splits.some((s) => s.status === "executed");

    // Build audit trail from ledger entries.
    const auditTrail: Array<Record<string, unknown>> = [
      { event: "va_created", timestamp: order.createdAt.toISOString() },
      ...order.ledgerEntries.map((e) => ({
        event:       e.entryType,
        amount_kobo: Number(e.amountKobo),
        timestamp:   e.createdAt.toISOString(),
        ...(e.narration ? { detail: e.narration } : {}),
        ...(e.reference  ? { reference: e.reference } : {}),
      })),
    ];

    res.status(200).json({
      order_ref:              order.orderRef,
      virtual_account_number: order.virtualAccountNumber ?? "",
      expected_amount_kobo:   expected,
      received_amount_kobo:   received,
      status:                 order.status,
      shortfall_kobo:         received !== null ? shortfallKobo(expected, received) : 0,
      excess_kobo:            received !== null ? excessKobo(expected, received) : 0,
      splits_executed:        splitsExecuted,
      splits: order.splits.map((s) => ({
        party:              s.party,
        percentage:         s.percentage,
        amount_paid_kobo:   s.amountKobo !== null ? Number(s.amountKobo) : null,
        status:             s.status,
        nomba_transfer_ref: s.nombaTransferRef ?? null,
      })),
      audit_trail: auditTrail,
    });
  } catch (err) {
    next(err);
  }
});

export { router as orderRouter };
