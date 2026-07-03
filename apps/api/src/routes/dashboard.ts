import { Router, type Router as ExpressRouter } from "express";
import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";

const router: ExpressRouter = Router();

// ─── GET /api/v1/dashboard/overview ──────────────────────────────────────────
// Aggregates today's order stats scoped to the calling merchant.
// "Today" is defined as midnight to now in UTC.
router.get("/dashboard/overview", apiKeyAuth, async (_req, res, next) => {
  try {
    const merchant = res.locals.merchant;
    const merchantId = merchant.id;

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Run all counts + sums in parallel — no dependency between them.
    // Every query is scoped to merchantId so merchants never see each other's data.
    const [
      ordersToday,
      totalExpected,
      totalReceived,
      paidCount,
      pendingCount,
      underpaymentCount,
      overpaymentCount,
      exceptionsOpen,
    ] = await Promise.all([
      prisma.order.count({
        where: { merchantId, createdAt: { gte: todayStart } },
      }),

      prisma.order.aggregate({
        _sum: { expectedAmountKobo: true },
        where: { merchantId, createdAt: { gte: todayStart } },
      }),

      prisma.order.aggregate({
        _sum: { receivedAmountKobo: true },
        where: {
          merchantId,
          createdAt: { gte: todayStart },
          receivedAmountKobo: { not: null },
        },
      }),

      prisma.order.count({ where: { merchantId, status: "paid",         createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { merchantId, status: "pending",      createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { merchantId, status: "underpayment", createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { merchantId, status: "overpayment",  createdAt: { gte: todayStart } } }),

      // Exceptions open across all time — not just today
      prisma.order.count({
        where: {
          merchantId,
          status: { in: ["underpayment", "overpayment", "unmatched"] },
        },
      }),
    ]);

    logger.info({ merchantId, ordersToday }, "Dashboard overview served");

    res.status(200).json({
      date:                        todayStart.toISOString().split("T")[0],
      total_expected_today_kobo:   Number(totalExpected._sum.expectedAmountKobo ?? 0),
      total_received_today_kobo:   Number(totalReceived._sum.receivedAmountKobo ?? 0),
      orders_paid:                 paidCount,
      orders_pending:              pendingCount,
      orders_underpayment:         underpaymentCount,
      orders_overpayment:          overpaymentCount,
      exceptions_open:             exceptionsOpen,
    });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRouter };
