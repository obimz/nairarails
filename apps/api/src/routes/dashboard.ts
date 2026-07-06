import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { authAny } from "../middleware/authAny.js";

const router: ExpressRouter = Router();

router.use(authAny);

// ─── Shared helpers ───────────────────────────────────────────────────────────

const RangeSchema = z.enum(["7d", "30d", "all"]).default("7d");

/**
 * Returns the UTC start Date for a given range, or null for "all".
 */
function rangeStart(range: "7d" | "30d" | "all"): Date | null {
  if (range === "all") return null;
  const days = range === "7d" ? 7 : 30;
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1)); // inclusive of today
  return d;
}

// ─── GET /api/v1/dashboard/overview ──────────────────────────────────────────
// Query param: ?range=7d (default) | 30d | all
//
// Stats are scoped to the merchant making the request AND to the selected range.
// exceptions_open is always all-time (open exceptions don't expire by date).
router.get("/dashboard/overview", async (req, res, next) => {
  try {
    const parsed = RangeSchema.safeParse(req.query["range"]);
    if (!parsed.success) {
      res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "range must be one of: 7d, 30d, all" },
      });
      return;
    }
    const range = parsed.data;
    const start = rangeStart(range);
    const merchantId = res.locals.merchant.id;

    // Base where clause — always scoped to this merchant
    const base = {
      merchantId,
      ...(start ? { createdAt: { gte: start } } : {}),
    };

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
        where: base,
      }),
      prisma.order.aggregate({
        _sum: { receivedAmountKobo: true },
        where: { ...base, receivedAmountKobo: { not: null } },
      }),
      prisma.order.count({ where: { ...base, status: "paid" } }),
      prisma.order.count({ where: { ...base, status: "pending" } }),
      prisma.order.count({ where: { ...base, status: "underpayment" } }),
      prisma.order.count({ where: { ...base, status: "overpayment" } }),
      // Open exceptions are always all-time for this merchant — not range-scoped.
      // An overpayment from 3 weeks ago is still open and still needs action.
      prisma.order.count({
        where: {
          merchantId,
          status: { in: ["underpayment", "overpayment", "unmatched"] },
        },
      }),
    ]);

    logger.info({ merchantId, range }, "Dashboard overview served");

    res.status(200).json({
      range,
      range_start:              start?.toISOString().split("T")[0] ?? null,
      total_expected_kobo:      Number(totalExpected._sum.expectedAmountKobo ?? 0),
      total_received_kobo:      Number(totalReceived._sum.receivedAmountKobo ?? 0),
      orders_paid:              paidCount,
      orders_pending:           pendingCount,
      orders_underpayment:      underpaymentCount,
      orders_overpayment:       overpaymentCount,
      exceptions_open:          exceptionsOpen,
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/dashboard/daily-series ──────────────────────────────────────
// Query param: ?range=7d (default) | 30d
//
// Returns one row per calendar day (UTC) in the range.
// Days with no orders still appear with zero counts — the frontend needs a
// continuous x-axis, not a sparse set of dates.
router.get("/dashboard/daily-series", async (req, res, next) => {
  try {
    const parsed = z.enum(["7d", "30d"]).default("7d").safeParse(req.query["range"]);
    if (!parsed.success) {
      res.status(422).json({
        error: { code: "VALIDATION_ERROR", message: "range must be one of: 7d, 30d" },
      });
      return;
    }
    const range = parsed.data;
    const days  = range === "7d" ? 7 : 30;
    const merchantId = res.locals.merchant.id;

    // Build the date spine first — every day in [start, today] inclusive.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const spine: Date[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      spine.push(d);
    }

    const start = spine[0]!;

    // Fetch all orders in the range for this merchant — only the fields we need.
    const orders = await prisma.order.findMany({
      where: {
        merchantId,
        createdAt: { gte: start },
      },
      select: {
        status:            true,
        createdAt:         true,
        receivedAmountKobo: true,
      },
    });

    // Bucket orders by calendar day (UTC date string "YYYY-MM-DD").
    type DayBucket = {
      paid:              number;
      pending:           number;
      underpayment:      number;
      overpayment:       number;
      total_received_kobo: number;
    };

    const buckets = new Map<string, DayBucket>();

    // Pre-fill every spine day with zeros so missing days aren't absent.
    for (const d of spine) {
      buckets.set(d.toISOString().split("T")[0]!, {
        paid: 0, pending: 0, underpayment: 0, overpayment: 0, total_received_kobo: 0,
      });
    }

    for (const order of orders) {
      const key = order.createdAt.toISOString().split("T")[0]!;
      const bucket = buckets.get(key);
      if (!bucket) continue; // outside spine (shouldn't happen, but guard)

      if (order.status === "paid")         bucket.paid++;
      else if (order.status === "pending") bucket.pending++;
      else if (order.status === "underpayment") bucket.underpayment++;
      else if (order.status === "overpayment")  bucket.overpayment++;

      if (order.receivedAmountKobo !== null) {
        bucket.total_received_kobo += Number(order.receivedAmountKobo);
      }
    }

    const series = spine.map((d) => {
      const key = d.toISOString().split("T")[0]!;
      return { date: key, ...buckets.get(key)! };
    });

    logger.info({ merchantId, range, days: series.length }, "Daily series served");

    res.status(200).json({ range, series });
  } catch (err) {
    next(err);
  }
});

export { router as dashboardRouter };
