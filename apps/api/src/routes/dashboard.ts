import { Router, type Router as ExpressRouter } from "express";
import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { jwtAuth } from "../middleware/jwtAuth.js";

const router: ExpressRouter = Router();

// ─── GET /api/v1/dashboard/overview ──────────────────────────────────────────
// Aggregates order stats scoped to the calling merchant.
router.get("/dashboard/overview", jwtAuth, async (_req, res, next) => {
  try {
    const merchant = res.locals.merchant;
    const merchantId = merchant.id;

    // Run all counts + sums in parallel — no dependency between them.
    // Every query is scoped to merchantId so merchants never see each other's data.
    const [
      totalExpected,
      totalReceived,
      paidCount,
      pendingCount,
      underpaymentCount,
      overpaymentCount,
      exceptionsOpen,
    ] = await Promise.all([
      prisma.order.aggregate({
        _sum: { expectedAmountKobo: true },
        where: { merchantId },
      }),

      prisma.order.aggregate({
        _sum: { receivedAmountKobo: true },
        where: { merchantId, receivedAmountKobo: { not: null } },
      }),

      prisma.order.count({ where: { merchantId, status: "paid"         } }),
      prisma.order.count({ where: { merchantId, status: "pending"      } }),
      prisma.order.count({ where: { merchantId, status: "underpayment" } }),
      prisma.order.count({ where: { merchantId, status: "overpayment"  } }),

      prisma.order.count({
        where: {
          merchantId,
          status: { in: ["underpayment", "overpayment", "unmatched"] },
        },
      }),
    ]);

    logger.info({ merchantId }, "Dashboard overview served");

    res.status(200).json({
      date:                        new Date().toISOString().split("T")[0],
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
