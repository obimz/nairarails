import { Router, type Router as ExpressRouter } from "express";
import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";

const router: ExpressRouter = Router();

// ─── GET /api/v1/dashboard/overview ──────────────────────────────────────────
// Aggregates today's order stats in a single set of parallel queries.
// "Today" is defined as midnight to now in UTC.
router.get("/dashboard/overview", async (_req, res, next) => {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // Run all counts + sums in parallel — no dependency between them.
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
      // Total orders created today (informational only)
      prisma.order.count({ where: { createdAt: { gte: todayStart } } }),

      // Sum of expectedAmountKobo for orders created today
      prisma.order.aggregate({
        _sum: { expectedAmountKobo: true },
        where: { createdAt: { gte: todayStart } },
      }),

      // Sum of receivedAmountKobo for orders created today that have been funded
      prisma.order.aggregate({
        _sum: { receivedAmountKobo: true },
        where: {
          createdAt: { gte: todayStart },
          receivedAmountKobo: { not: null },
        },
      }),

      prisma.order.count({ where: { status: "paid",         createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { status: "pending",      createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { status: "underpayment", createdAt: { gte: todayStart } } }),
      prisma.order.count({ where: { status: "overpayment",  createdAt: { gte: todayStart } } }),

      // Exceptions open across all time — not just today
      prisma.order.count({
        where: { status: { in: ["underpayment", "overpayment", "unmatched"] } },
      }),
    ]);

    logger.info({ ordersToday }, "Dashboard overview served");

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
