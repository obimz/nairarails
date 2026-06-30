import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { AppError } from "../middleware/errorHandler.js";

const router: ExpressRouter = Router();

const ExceptionQuerySchema = z.object({
  type: z.enum(["underpayment", "overpayment", "unmatched"]).optional(),
});

// ─── GET /api/v1/exceptions ───────────────────────────────────────────────────
router.get("/exceptions", async (req, res, next) => {
  try {
    const query = ExceptionQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new AppError(422, "VALIDATION_ERROR", "Invalid query parameters");
    }

    // TODO (Phase 3): SELECT from orders WHERE status IN ('underpayment','overpayment','unmatched')
    // optionally filtered by type, joined with splits for context.
    logger.info({ filter: query.data.type ?? "all" }, "Listing exceptions (stub)");

    res.status(200).json({
      results: [
        {
          order_ref:            "ORD-1144",
          type:                 "overpayment",
          expected_amount_kobo: 5000000,
          received_amount_kobo: 5300000,
          shortfall_kobo:       0,
          excess_kobo:          300000,
          raised_at:            "2026-06-28T11:02:00.000Z",
          resolved:             false,
          resolved_at:          null,
        },
        {
          order_ref:            "ORD-9821",
          type:                 "underpayment",
          expected_amount_kobo: 5000000,
          received_amount_kobo: 4800000,
          shortfall_kobo:       200000,
          excess_kobo:          0,
          raised_at:            "2026-06-28T14:32:11.000Z",
          resolved:             false,
          resolved_at:          null,
        },
      ],
      total_count: 2,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/exceptions/:order_ref/refund-excess ────────────────────────
router.post("/exceptions/:order_ref/refund-excess", async (req, res, next) => {
  try {
    const { order_ref } = req.params as { order_ref: string };

    logger.info({ order_ref }, "Refund excess triggered (stub — Phase 4 will call Nomba transfer)");

    // TODO (Phase 3): fetch order, verify it is an overpayment and not already resolved.
    // TODO (Phase 4): call nombaClient.lookupBankAccount(senderBankCode, senderAccountNumber)
    //   then nombaClient.transferToBank() to return the excess to the original payer.
    // TODO (Phase 3): update orders.status = 'resolved', insert ledger_entry.

    res.status(200).json({
      order_ref,
      refunded_amount_kobo: 300000,
      status:               "resolved",
      nomba_transfer_ref:   "STUB-TXN-" + Date.now(),
    });
  } catch (err) {
    next(err);
  }
});

export { router as exceptionRouter };
