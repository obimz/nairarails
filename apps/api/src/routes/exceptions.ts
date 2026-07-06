import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { Prisma, OrderStatus } from "@prisma/client";
import { excessKobo, shortfallKobo } from "@nairarails/webhook-core";
import { prisma } from "../db/client.js";
import { lookupBankAccount, transferToBank } from "../integrations/nombaClient.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../middleware/errorHandler.js";
import { authAny } from "../middleware/authAny.js";

const router: ExpressRouter = Router();

router.use(authAny);

const ExceptionQuerySchema = z.object({
  type: z.enum(["underpayment", "overpayment", "unmatched"]).optional(),
});

// ─── GET /api/v1/exceptions ───────────────────────────────────────────────────
// Returns all orders in a non-normal state (underpayment / overpayment / unmatched).
// Optionally filtered by type via ?type=overpayment.
router.get("/exceptions", async (req, res, next) => {
  try {
    const query = ExceptionQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new AppError(422, "VALIDATION_ERROR", "Invalid query parameters");
    }

    const { type } = query.data;
    const merchantId = res.locals.merchant.id;

    // Build status filter: if a specific type was requested use it,
    // otherwise return all three exception statuses.
    const statusFilter: Prisma.EnumOrderStatusFilter = type
      ? { equals: type as OrderStatus }
      : { in: ["underpayment", "overpayment", "unmatched"] as OrderStatus[] };

    const orders = await prisma.order.findMany({
      where:   { merchantId, status: statusFilter },
      orderBy: { updatedAt: "desc" },
      select: {
        orderRef:           true,
        status:             true,
        expectedAmountKobo: true,
        receivedAmountKobo: true,
        updatedAt:          true,
      },
    });

    logger.info({ merchantId, filter: type ?? "all", count: orders.length }, "Exceptions listed");

    res.status(200).json({
      results: orders.map((o) => {
        const expected = Number(o.expectedAmountKobo);
        const received = o.receivedAmountKobo !== null ? Number(o.receivedAmountKobo) : 0;
        return {
          order_ref:            o.orderRef,
          type:                 o.status,
          expected_amount_kobo: expected,
          received_amount_kobo: received,
          shortfall_kobo:       shortfallKobo(expected, received),
          excess_kobo:          excessKobo(expected, received),
          raised_at:            o.updatedAt.toISOString(),
          resolved:             false,
          resolved_at:          null,
        };
      }),
      total_count: orders.length,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/exceptions/:order_ref/refund-excess ────────────────────────
router.post("/exceptions/:order_ref/refund-excess", async (req, res, next) => {
  try {
    const { order_ref } = req.params as { order_ref: string };
    const merchantId = res.locals.merchant.id;

    const order = await prisma.order.findUnique({ where: { orderRef: order_ref } });
    if (!order || order.merchantId !== merchantId) {
      throw new AppError(404, "ORDER_NOT_FOUND", `Order '${order_ref}' not found`);
    }

    if (order.status !== "overpayment") {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        `Order '${order_ref}' is not an overpayment — current status: ${order.status}`
      );
    }

    if (!order.senderAccountNumber || !order.senderBankCode) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        `Order '${order_ref}' has no sender account on record — cannot initiate refund`
      );
    }

    const expected = Number(order.expectedAmountKobo);
    const received = Number(order.receivedAmountKobo ?? 0);
    const refundKobo = excessKobo(expected, received);

    if (refundKobo <= 0) {
      throw new AppError(422, "VALIDATION_ERROR", `No excess to refund for order '${order_ref}'`);
    }

    logger.info(
      { order_ref, merchantId, refundKobo, senderAccount: order.senderAccountNumber },
      "Initiating refund-excess via Nomba transfer"
    );

    const { accountName } = await lookupBankAccount({
      bankCode:      order.senderBankCode,
      accountNumber: order.senderAccountNumber,
    });

    const merchantTxRef = `refund_${order_ref}`;
    const { transferRef, status: txStatus } = await transferToBank({
      amountKobo:    refundKobo,
      bankCode:      order.senderBankCode,
      accountNumber: order.senderAccountNumber,
      accountName,
      narration:     `NairaRails refund — excess for order ${order_ref}`,
      merchantTxRef,
    });

    const refundConfirmed = txStatus.toLowerCase() === "success";
    const newOrderStatus  = refundConfirmed ? "refunded" : "overpayment";

    await prisma.$transaction([
      prisma.order.update({
        where: { orderRef: order_ref },
        data:  { status: newOrderStatus },
      }),
      prisma.ledgerEntry.create({
        data: {
          orderRef:   order_ref,
          entryType:  "refund_issued",
          amountKobo: BigInt(-refundKobo),
          reference:  transferRef,
          narration:  `Excess refund to ${order.senderName ?? order.senderAccountNumber}: ${refundKobo} kobo (${refundConfirmed ? "confirmed" : "pending"})`,
        },
      }),
    ]);

    logger.info(
      { order_ref, refundKobo, transferRef, txStatus, refundConfirmed },
      `Refund-excess ${refundConfirmed ? "completed" : "initiated (pending)"}`
    );

    res.status(200).json({
      order_ref,
      refunded_amount_kobo: refundKobo,
      sender_account:       order.senderAccountNumber,
      sender_bank:          order.senderBankCode,
      status:               refundConfirmed ? "resolved" : "pending",
      nomba_transfer_ref:   transferRef,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/exceptions/:order_ref/refund-shortfall ─────────────────────
// Returns the amount already received back to the buyer and closes the order.
router.post("/exceptions/:order_ref/refund-shortfall", async (req, res, next) => {
  try {
    const { order_ref } = req.params as { order_ref: string };
    const merchantId = res.locals.merchant.id;

    const order = await prisma.order.findUnique({ where: { orderRef: order_ref } });
    if (!order || order.merchantId !== merchantId) {
      throw new AppError(404, "ORDER_NOT_FOUND", `Order '${order_ref}' not found`);
    }

    if (order.status !== "underpayment") {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        `Order '${order_ref}' is not an underpayment — current status: ${order.status}`
      );
    }

    if (!order.senderAccountNumber || !order.senderBankCode) {
      throw new AppError(
        422,
        "VALIDATION_ERROR",
        `Order '${order_ref}' has no sender account on record — cannot initiate refund`
      );
    }

    const received = Number(order.receivedAmountKobo ?? 0);
    if (received <= 0) {
      throw new AppError(422, "VALIDATION_ERROR", `No received amount to refund for order '${order_ref}'`);
    }

    logger.info(
      { order_ref, merchantId, received, senderAccount: order.senderAccountNumber },
      "Initiating refund-shortfall via Nomba transfer"
    );

    const { accountName } = await lookupBankAccount({
      bankCode:      order.senderBankCode,
      accountNumber: order.senderAccountNumber,
    });

    const merchantTxRef = `refund_shortfall_${order_ref}`;
    const { transferRef, status: txStatus } = await transferToBank({
      amountKobo:    received,
      bankCode:      order.senderBankCode,
      accountNumber: order.senderAccountNumber,
      accountName,
      narration:     `NairaRails refund — shortfall return for order ${order_ref}`,
      merchantTxRef,
    });

    const refundConfirmed = txStatus.toLowerCase() === "success";
    const newOrderStatus  = refundConfirmed ? "refunded" : "underpayment";

    await prisma.$transaction([
      prisma.order.update({
        where: { orderRef: order_ref },
        data:  { status: newOrderStatus },
      }),
      prisma.ledgerEntry.create({
        data: {
          orderRef:   order_ref,
          entryType:  "refund_issued",
          amountKobo: BigInt(-received),
          reference:  transferRef,
          narration:  `Shortfall refund to ${order.senderName ?? order.senderAccountNumber}: ${received} kobo (${refundConfirmed ? "confirmed" : "pending"})`,
        },
      }),
    ]);

    logger.info(
      { order_ref, received, transferRef, txStatus, refundConfirmed },
      `Refund-shortfall ${refundConfirmed ? "completed" : "initiated (pending)"}`
    );

    res.status(200).json({
      order_ref,
      refunded_amount_kobo: received,
      sender_account:       order.senderAccountNumber,
      sender_bank:          order.senderBankCode,
      status:               refundConfirmed ? "resolved" : "pending",
      nomba_transfer_ref:   transferRef,
    });
  } catch (err) {
    next(err);
  }
});

export { router as exceptionRouter };
