// apps/api/src/lib/reconciliationCron.ts
//
// Nightly reconciliation backstop — runs inside the API process via node-cron.
//
// What it does:
//   1. Pulls yesterday's successful transactions from Nomba's /transactions API
//   2. Diffs them against our local ledger_entries by transactionId (reference column)
//   3. Logs orphans (on Nomba, missing from our ledger — likely a missed webhook)
//      and amount drift (amount mismatch between Nomba and our DB)
//   4. Does NOT auto-heal — it surfaces the discrepancy for ops review.
//      Missed webhooks can be replayed via POST /api/v1/admin/orders/:orderRef/force-pay
//
// Schedule: 02:00 WAT (01:00 UTC) every night.
//   Cron expression: "0 1 * * *"
//   Running at 1am UTC avoids the midnight rollover window and keeps the
//   window firmly in the previous calendar day.
//
// Failure behaviour: errors are logged but never re-thrown — a cron failure
// must never crash the API process or affect live webhook handling.

import cron from "node-cron";
import { listTransactions }    from "../integrations/nombaClient.js";
import { prisma }              from "../db/client.js";
import { logger }              from "./logger.js";

// ─── Core reconciliation logic ────────────────────────────────────────────────
// Extracted as a named export so it can be tested in isolation and called
// on-demand (e.g. from the admin endpoint) without invoking the scheduler.

export async function runReconciliation(dateFrom: string, dateTo: string): Promise<{
  checkedAt:   string;
  dateFrom:    string;
  dateTo:      string;
  totalNomba:  number;
  matched:     number;
  orphans:     Array<{ transactionId: string; merchantTxRef: string; amountKobo: number; createdAt: string }>;
  drift:       Array<{ transactionId: string; merchantTxRef: string; nombaAmountKobo: number; localAmountKobo: number; orderRef: string }>;
}> {
  logger.info({ dateFrom, dateTo }, "[reconciliationCron] Starting reconciliation run");

  // ── 1. Pull Nomba transactions ─────────────────────────────────────────────
  const { transactions, totalCount } = await listTransactions({
    dateFrom,
    dateTo,
    status:   "success",
    pageSize: 200, // increase if daily volume exceeds 200 — add pagination loop
  });

  if (transactions.length === 0) {
    logger.info({ dateFrom, dateTo }, "[reconciliationCron] No Nomba transactions found — nothing to reconcile");
    return {
      checkedAt:  new Date().toISOString(),
      dateFrom,
      dateTo,
      totalNomba: 0,
      matched:    0,
      orphans:    [],
      drift:      [],
    };
  }

  // ── 2. Pull our local ledger entries for the same window ───────────────────
  const periodStart = new Date(`${dateFrom}T00:00:00.000Z`);
  const periodEnd   = new Date(`${dateTo}T23:59:59.999Z`);

  const localEntries = await prisma.ledgerEntry.findMany({
    where: {
      createdAt: { gte: periodStart, lte: periodEnd },
      reference: { not: null },
    },
    select: {
      reference:  true,
      amountKobo: true,
      orderRef:   true,
    },
  });

  // Index by reference (= Nomba transactionId) for O(1) lookup
  const localByRef = new Map(
    localEntries.map((e) => [e.reference, e])
  );

  // ── 3. Diff ────────────────────────────────────────────────────────────────
  const orphans: Array<{ transactionId: string; merchantTxRef: string; amountKobo: number; createdAt: string }> = [];
  const drift:   Array<{ transactionId: string; merchantTxRef: string; nombaAmountKobo: number; localAmountKobo: number; orderRef: string }> = [];
  let   matched = 0;

  for (const tx of transactions) {
    const local = localByRef.get(tx.transactionId);

    // Nomba returns amounts in NAIRA — convert to kobo for comparison against
    // our ledger which stores everything in kobo.
    const nombaAmountKobo = Math.round(tx.amount * 100);

    if (!local) {
      // Nomba processed this payment but we have no ledger entry for it.
      // Most likely cause: the webhook fired but our server was down or it was dropped.
      orphans.push({
        transactionId: tx.transactionId,
        merchantTxRef: tx.merchantTxRef,
        amountKobo:    nombaAmountKobo,
        createdAt:     tx.createdAt,
      });
      continue;
    }

    const localKobo = Math.abs(Number(local.amountKobo));
    if (localKobo !== nombaAmountKobo) {
      // We recorded the payment but at a different amount — data integrity issue.
      drift.push({
        transactionId:   tx.transactionId,
        merchantTxRef:   tx.merchantTxRef,
        nombaAmountKobo: nombaAmountKobo,
        localAmountKobo: localKobo,
        orderRef:        local.orderRef,
      });
      continue;
    }

    matched++;
  }

  // ── 4. Log results ─────────────────────────────────────────────────────────
  const summary = {
    dateFrom,
    dateTo,
    totalNomba: totalCount,
    matched,
    orphanCount: orphans.length,
    driftCount:  drift.length,
  };

  if (orphans.length > 0 || drift.length > 0) {
    logger.warn(
      { ...summary, orphans, drift },
      "[reconciliationCron] ⚠️  Reconciliation drift detected — manual review required"
    );
  } else {
    logger.info(summary, "[reconciliationCron] ✅ Reconciliation clean — all Nomba transactions matched");
  }

  return {
    checkedAt:  new Date().toISOString(),
    dateFrom,
    dateTo,
    totalNomba: totalCount,
    matched,
    orphans,
    drift,
  };
}

// ─── Scheduler ────────────────────────────────────────────────────────────────
// Call this once from server.ts after the HTTP server starts listening.
// The returned ScheduledTask can be stopped for graceful shutdown if needed.

export function startReconciliationCron(): cron.ScheduledTask {
  // 02:00 WAT = 01:00 UTC every night
  // Expression: second(opt) minute hour day month weekday
  const SCHEDULE = "0 1 * * *";
  const TIMEZONE = "UTC";

  logger.info(
    { schedule: SCHEDULE, timezone: TIMEZONE },
    "[reconciliationCron] Nightly reconciliation cron registered"
  );

  const task = cron.schedule(
    SCHEDULE,
    async () => {
      // Target yesterday — the full previous calendar day in UTC
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const dateStr = yesterday.toISOString().split("T")[0] as string; // "YYYY-MM-DD"

      logger.info({ date: dateStr }, "[reconciliationCron] Nightly cron triggered — reconciling yesterday");

      try {
        await runReconciliation(dateStr, dateStr);
      } catch (err) {
        // Never re-throw — a reconciliation failure must not crash the API process
        logger.error({ err }, "[reconciliationCron] Nightly reconciliation failed — will retry next scheduled run");
      }
    },
    { timezone: TIMEZONE }
  );

  return task;
}
