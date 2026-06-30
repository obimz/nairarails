import { Router } from "express";
import { z } from "zod";
import { CreateOrderRequestSchema } from "@nairarails/shared-types";
import { calculateSplits } from "@nairarails/webhook-core";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Query schema for GET /orders ─────────────────────────────────────────────
const ListOrdersQuerySchema = z.object({
  page:      z.coerce.number().int().positive().default(1),
  page_size: z.coerce.number().int().positive().max(100).default(20),
  status:    z.enum(["pending", "paid", "underpayment", "overpayment", "unmatched"]).optional(),
});

// ─── POST /api/v1/orders ──────────────────────────────────────────────────────
router.post(
  "/orders",
  validate(CreateOrderRequestSchema),
  async (req, res, next) => {
    try {
      const { order_ref, customer_name, expected_amount_kobo, currency, splits } =
        req.body as import("@nairarails/shared-types").CreateOrderRequest;

      // Show the split allocations in the log so it's clear the math was done.
      const allocations = calculateSplits(expected_amount_kobo, splits);
      logger.info(
        { order_ref, customer_name, expected_amount_kobo, allocations },
        "Order created (stub — Phase 3 will write to DB + call Nomba VA)"
      );

      // TODO (Phase 3): INSERT order + splits in a single DB transaction.
      // TODO (Phase 4): call nombaClient.createVirtualAccount() and store the NUBAN.

      res.status(201).json({
        order_ref,
        virtual_account_number: "9900012345", // placeholder until Phase 4
        bank_name: "Nomba",
        bank_code: "000026",
        expected_amount_kobo,
        currency,
        status: "pending",
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/v1/orders ───────────────────────────────────────────────────────
router.get("/orders", async (req, res, next) => {
  try {
    const query = ListOrdersQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new AppError(422, "VALIDATION_ERROR", "Invalid query parameters");
    }
    const { page, page_size } = query.data;

    // TODO (Phase 3): SELECT from orders with pagination + status filter.
    logger.info({ page, page_size }, "Listing orders (stub)");

    res.status(200).json({
      results: [
        {
          order_ref:              "ORD-9821",
          customer_name:          "Chisom Traders",
          expected_amount_kobo:   5000000,
          received_amount_kobo:   4800000,
          status:                 "underpayment",
          virtual_account_number: "9900012345",
          created_at:             "2026-06-28T09:00:00.000Z",
        },
        {
          order_ref:              "ORD-1144",
          customer_name:          "Emeka Okafor",
          expected_amount_kobo:   5000000,
          received_amount_kobo:   5300000,
          status:                 "overpayment",
          virtual_account_number: "9900054321",
          created_at:             "2026-06-28T10:00:00.000Z",
        },
        {
          order_ref:              "ORD-0077",
          customer_name:          "Adaeze Foods",
          expected_amount_kobo:   500000,
          received_amount_kobo:   500000,
          status:                 "paid",
          virtual_account_number: "9900099999",
          created_at:             "2026-06-28T11:00:00.000Z",
        },
      ],
      page,
      page_size,
      total_count: 3,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/orders/:order_ref/reconciliation ─────────────────────────────
router.get("/orders/:order_ref/reconciliation", async (req, res, next) => {
  try {
    const { order_ref } = req.params as { order_ref: string };

    // TODO (Phase 3): JOIN orders + splits + ledger_entries + webhook_events.
    logger.info({ order_ref }, "Reconciliation detail requested (stub)");

    res.status(200).json({
      order_ref,
      virtual_account_number:  "9900012345",
      expected_amount_kobo:    5000000,
      received_amount_kobo:    4800000,
      status:                  "underpayment",
      shortfall_kobo:          200000,
      excess_kobo:             0,
      splits_executed:         false,
      splits: [
        { party: "seller",   percentage: 85, amount_kobo: null, status: "blocked", nomba_transfer_ref: null },
        { party: "platform", percentage: 10, amount_kobo: null, status: "blocked", nomba_transfer_ref: null },
        { party: "rider",    percentage: 5,  amount_kobo: null, status: "blocked", nomba_transfer_ref: null },
      ],
      audit_trail: [
        { event: "va_created",       timestamp: "2026-06-28T09:00:00.000Z" },
        { event: "payment_received", amount_kobo: 4800000, timestamp: "2026-06-28T14:32:11.000Z" },
        { event: "classified",       status: "underpayment", timestamp: "2026-06-28T14:32:11.000Z" },
        { event: "notification_sent", channel: "dashboard", timestamp: "2026-06-28T14:32:12.000Z" },
      ],
    });
  } catch (err) {
    next(err);
  }
});

export { router as orderRouter };
