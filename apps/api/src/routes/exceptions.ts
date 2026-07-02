import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { Prisma, OrderStatus } from "@prisma/client";
import { excessKobo, shortfallKobo } from "@nairarails/webhook-core";
import { prisma } from "../db/client.js";
import { lookupBankAccount, transferToBank } from "../integrations/nombaClient.js";
import { logger } from "../lib/logger.js";
import { AppError } from "../middleware/errorHandler.js";

const router: ExpressRouter = Router();

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

    // Build status filter: if a specific type was requested use it,
    // otherwise return all three exception statuses.
    const statusFilter: Prisma.EnumOrderStatusFilter = type
      ? { equals: type as OrderStatus }
      : { in: ["underpayment", "overpayment", "unmatched"] as OrderStatus[] };

    const orders = await prisma.order.findMany({
      where:   { status: statusFilter },
      orderBy: { updatedAt: "desc" },
      select: {
        orderRef:           true,
        status:             true,
        expectedAmountKobo: true,
        receivedAmountKobo: true,
        updatedAt:          true,
      },
    });

    logger.info({ filter: type ?? "all", count: orders.length }, "Exceptions listed");

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
          resolved:             false,   // Phase 4 adds a resolved status via refund flow
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
// Validates the order is an overpayment with captured sender details, then
// Phase 4 will call Nomba to transfer the excess back to the original payer.
router.post("/exceptions/:order_ref/refund-excess", async (req, res, next) => {
  try {
    const { order_ref } = req.params as { order_ref: string };

    const order = await prisma.order.findUnique({ where: { orderRef: order_ref } });
    if (!order) {
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
      {
        order_ref,
        refundKobo,
        senderAccount: order.senderAccountNumber,
        senderBank:    order.senderBankCode,
      },
      "Initiating refund-excess via Nomba transfer"
    );

    // Step 1: Verify recipient before sending — never skip lookup.
    const { accountName } = await lookupBankAccount({
      bankCode:      order.senderBankCode,
      accountNumber: order.senderAccountNumber,
    });

    // Step 2: Transfer the excess back to the original payer.
    const merchantTxRef = `refund_${order_ref}`;
    const { transferRef, status: txStatus } = await transferToBank({
      amountKobo:    refundKobo,
      bankCode:      order.senderBankCode,
      accountNumber: order.senderAccountNumber,
      accountName,
      narration:     `NairaRails refund — excess for order ${order_ref}`,
      merchantTxRef,
    });

    // Step 3: Mark order as paid (excess returned, net is correct) and log the refund.
    await prisma.$transaction([
      prisma.order.update({
        where: { orderRef: order_ref },
        data:  { status: "paid" },
      }),
      prisma.ledgerEntry.create({
        data: {
          orderRef:   order_ref,
          entryType:  "refund_issued",
          amountKobo: BigInt(-refundKobo), // debit — money leaving
          reference:  transferRef,
          narration:  `Excess refund to ${order.senderName ?? order.senderAccountNumber}: ${refundKobo} kobo`,
        },
      }),
    ]);

    logger.info(
      { order_ref, refundKobo, transferRef, txStatus },
      "Refund-excess completed"
    );

    res.status(200).json({
      order_ref,
      refunded_amount_kobo: refundKobo,
      sender_account:       order.senderAccountNumber,
      sender_bank:          order.senderBankCode,
      status:               "resolved",
      nomba_transfer_ref:   transferRef,
    });
  } catch (err) {
    next(err);
  }
});

export { router as exceptionRouter };
