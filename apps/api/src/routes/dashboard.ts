import { Router, type Router as ExpressRouter } from "express";
import { logger } from "../lib/logger.js";

const router: ExpressRouter = Router();

// ─── GET /api/v1/dashboard/overview ──────────────────────────────────────────
router.get("/dashboard/overview", async (_req, res, next) => {
  try {
    // TODO (Phase 6): aggregate query across orders for today's stats.
    logger.info("Dashboard overview requested (stub)");

    res.status(200).json({
      date:                        new Date().toISOString().split("T")[0],
      total_expected_today_kobo:   25000000,
      total_received_today_kobo:   23100000,
      orders_paid:                 4,
      orders_pending:              2,
      orders_underpayment:         1,
      orders_overpayment:          1,
      exceptions_open:             2,
    });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRouter };
