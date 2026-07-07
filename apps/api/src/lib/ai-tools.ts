/**
 * apps/api/src/lib/ai-tools.ts
 *
 * Tool definitions and handlers for the NairaRails AI support assistant.
 * Each tool maps 1:1 to a Gemini function declaration.
 *
 * Handlers receive the merchant ID (from auth) and the args Gemini extracted.
 * They query Prisma directly — no HTTP round-trips.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";

// ─── Gemini function declaration types ───────────────────────────────────────

export interface FunctionDeclaration {
  name:        string;
  description: string;
  parameters:  {
    type:       string;
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?:  string[];
  };
}

// ─── Tool result type ─────────────────────────────────────────────────────────

export type ToolResult =
  | { ok: true;  data: unknown }
  | { ok: false; error: string };

// ─── Helper: kobo → naira string ─────────────────────────────────────────────

function naira(kobo: number | bigint): string {
  return `₦${(Number(kobo) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
}

// ─── Tool declarations (sent to Gemini) ──────────────────────────────────────

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "get_dashboard_overview",
    description:
      "Get a high-level financial overview for this merchant: total expected vs received, order counts by status, and open exceptions. Use this when the merchant asks about their overall performance, collection rate, or summary stats.",
    parameters: {
      type: "object",
      properties: {
        range: {
          type:        "string",
          description: "Time range for the stats",
          enum:        ["7d", "30d", "all"],
        },
      },
    },
  },
  {
    name: "list_orders",
    description:
      "List orders for the merchant with optional filters. Use this when the merchant asks to see their orders, check statuses, or find a specific order.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type:        "string",
          description: "Filter by order status",
          enum:        ["pending", "paid", "underpayment", "overpayment", "unmatched", "expired", "refunded"],
        },
        limit: {
          type:        "string",
          description: "Max number of orders to return (default 10, max 25)",
        },
        search: {
          type:        "string",
          description: "Search by order_ref or customer name",
        },
      },
    },
  },
  {
    name: "get_order_detail",
    description:
      "Get full reconciliation detail for a specific order: payment status, amounts, splits, and ledger entries. Use this when the merchant asks about a specific order by its reference.",
    parameters: {
      type: "object",
      properties: {
        order_ref: {
          type:        "string",
          description: "The order reference (e.g. ord-001)",
        },
      },
      required: ["order_ref"],
    },
  },
  {
    name: "get_exceptions",
    description:
      "List all open exceptions (underpayments, overpayments, unmatched payments). Use this when the merchant asks about problematic orders, missing payments, or the exceptions queue.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type:        "string",
          description: "Filter by exception type",
          enum:        ["underpayment", "overpayment", "unmatched"],
        },
      },
    },
  },
  {
    name: "generate_collection_report",
    description:
      "Generate a detailed collection report for a date range: total collected, success rate, breakdown by status, top paying customers, and daily trend. Use this when the merchant asks for a report, analytics, or wants to understand their payment performance.",
    parameters: {
      type: "object",
      properties: {
        range: {
          type:        "string",
          description: "Date range for the report",
          enum:        ["7d", "30d", "all"],
        },
      },
    },
  },
  {
    name: "get_recent_transactions",
    description:
      "Get the most recent ledger entries (payments received, splits paid out, refunds issued). Use this to answer questions about recent activity or transaction history.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type:        "string",
          description: "Number of entries to return (default 10, max 20)",
        },
        entry_type: {
          type:        "string",
          description: "Filter by entry type",
          enum:        ["payment_received", "split_payout", "refund_issued", "adjustment"],
        },
      },
    },
  },
  {
    name: "get_merchant_info",
    description:
      "Get the merchant's account information: name, email, webhook URL, settlement account, API key status. Use this when the merchant asks about their account settings or configuration.",
    parameters: {
      type:       "object",
      properties: {},
    },
  },
];

// ─── Tool handlers ────────────────────────────────────────────────────────────

export async function runTool(
  name:       string,
  args:       Record<string, string>,
  merchantId: string
): Promise<ToolResult> {
  try {
    switch (name) {
      case "get_dashboard_overview":  return await toolGetDashboardOverview(merchantId, args);
      case "list_orders":             return await toolListOrders(merchantId, args);
      case "get_order_detail":        return await toolGetOrderDetail(merchantId, args);
      case "get_exceptions":          return await toolGetExceptions(merchantId, args);
      case "generate_collection_report": return await toolGenerateCollectionReport(merchantId, args);
      case "get_recent_transactions": return await toolGetRecentTransactions(merchantId, args);
      case "get_merchant_info":       return await toolGetMerchantInfo(merchantId);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}

// ── get_dashboard_overview ────────────────────────────────────────────────────

async function toolGetDashboardOverview(
  merchantId: string,
  args: Record<string, string>
): Promise<ToolResult> {
  const range = (args["range"] ?? "7d") as "7d" | "30d" | "all";

  let start: Date | null = null;
  if (range !== "all") {
    const days = range === "7d" ? 7 : 30;
    start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));
  }

  const base = {
    merchantId,
    ...(start ? { createdAt: { gte: start } } : {}),
  };

  const [
    totalExpected,
    totalReceived,
    statusCounts,
    exceptionsOpen,
  ] = await Promise.all([
    prisma.order.aggregate({ _sum: { expectedAmountKobo: true }, where: base }),
    prisma.order.aggregate({ _sum: { receivedAmountKobo: true }, where: { ...base, receivedAmountKobo: { not: null } } }),
    prisma.order.groupBy({ by: ["status"], _count: { id: true }, where: base }),
    prisma.order.count({ where: { merchantId, status: { in: ["underpayment", "overpayment", "unmatched"] } } }),
  ]);

  const expectedKobo = Number(totalExpected._sum.expectedAmountKobo ?? 0);
  const receivedKobo = Number(totalReceived._sum.receivedAmountKobo ?? 0);
  const collectionRate = expectedKobo > 0 ? ((receivedKobo / expectedKobo) * 100).toFixed(1) : "0.0";

  const counts: Record<string, number> = {};
  for (const row of statusCounts) {
    counts[row.status] = row._count.id;
  }

  return {
    ok: true,
    data: {
      range,
      range_label:         range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "All time",
      total_expected:      naira(expectedKobo),
      total_received:      naira(receivedKobo),
      total_expected_kobo: expectedKobo,
      total_received_kobo: receivedKobo,
      collection_rate_pct: collectionRate,
      orders_paid:         counts["paid"]         ?? 0,
      orders_pending:      counts["pending"]       ?? 0,
      orders_underpayment: counts["underpayment"]  ?? 0,
      orders_overpayment:  counts["overpayment"]   ?? 0,
      orders_unmatched:    counts["unmatched"]      ?? 0,
      orders_expired:      counts["expired"]        ?? 0,
      orders_refunded:     counts["refunded"]       ?? 0,
      exceptions_open:     exceptionsOpen,
    },
  };
}

// ── list_orders ───────────────────────────────────────────────────────────────

async function toolListOrders(
  merchantId: string,
  args: Record<string, string>
): Promise<ToolResult> {
  const limit  = Math.min(parseInt(args["limit"] ?? "10", 10) || 10, 25);
  const status = args["status"] as string | undefined;
  const search = args["search"] as string | undefined;

  const where: Prisma.OrderWhereInput = {
    merchantId,
    ...(status ? { status: status as Prisma.EnumOrderStatusFilter } : {}),
    ...(search
      ? {
          OR: [
            { orderRef:     { contains: search, mode: "insensitive" } },
            { customerName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take:    limit,
    select: {
      orderRef:           true,
      customerName:       true,
      status:             true,
      expectedAmountKobo: true,
      receivedAmountKobo: true,
      createdAt:          true,
    },
  });

  return {
    ok:   true,
    data: {
      count:  orders.length,
      orders: orders.map((o) => ({
        order_ref:       o.orderRef,
        customer:        o.customerName,
        status:          o.status,
        expected:        naira(o.expectedAmountKobo),
        received:        o.receivedAmountKobo != null ? naira(o.receivedAmountKobo) : "—",
        expected_kobo:   Number(o.expectedAmountKobo),
        received_kobo:   o.receivedAmountKobo != null ? Number(o.receivedAmountKobo) : null,
        created_at:      o.createdAt.toISOString(),
      })),
    },
  };
}

// ── get_order_detail ──────────────────────────────────────────────────────────

async function toolGetOrderDetail(
  merchantId: string,
  args: Record<string, string>
): Promise<ToolResult> {
  const orderRef = args["order_ref"];
  if (!orderRef) return { ok: false, error: "order_ref is required" };

  const order = await prisma.order.findUnique({
    where:  { orderRef },
    include: {
      splits:       true,
      ledgerEntries: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!order || order.merchantId !== merchantId) {
    return { ok: false, error: `Order '${orderRef}' not found` };
  }

  const expectedKobo = Number(order.expectedAmountKobo);
  const receivedKobo = order.receivedAmountKobo != null ? Number(order.receivedAmountKobo) : null;

  return {
    ok: true,
    data: {
      order_ref:        order.orderRef,
      customer:         order.customerName,
      customer_email:   order.customerEmail ?? null,
      status:           order.status,
      expected:         naira(expectedKobo),
      received:         receivedKobo != null ? naira(receivedKobo) : "—",
      expected_kobo:    expectedKobo,
      received_kobo:    receivedKobo,
      shortfall_kobo:   receivedKobo != null && receivedKobo < expectedKobo ? expectedKobo - receivedKobo : 0,
      excess_kobo:      receivedKobo != null && receivedKobo > expectedKobo ? receivedKobo - expectedKobo : 0,
      virtual_account:  order.virtualAccountNumber ?? null,
      bank_name:        order.bankName ?? null,
      sender_name:      order.senderName ?? null,
      created_at:       order.createdAt.toISOString(),
      updated_at:       order.updatedAt.toISOString(),
      splits: order.splits.map((s) => ({
        party:          s.party,
        account:        s.accountNumber,
        bank_code:      s.bankCode,
        percentage:     s.percentage,
        amount:         s.amountKobo != null ? naira(s.amountKobo) : "—",
        status:         s.status,
        transfer_ref:   s.nombaTransferRef ?? null,
      })),
      ledger: order.ledgerEntries.map((e) => ({
        type:       e.entryType,
        amount:     naira(Math.abs(Number(e.amountKobo))),
        direction:  Number(e.amountKobo) >= 0 ? "credit" : "debit",
        narration:  e.narration ?? null,
        reference:  e.reference ?? null,
        date:       e.createdAt.toISOString(),
      })),
    },
  };
}

// ── get_exceptions ────────────────────────────────────────────────────────────

async function toolGetExceptions(
  merchantId: string,
  args: Record<string, string>
): Promise<ToolResult> {
  const type = args["type"] as "underpayment" | "overpayment" | "unmatched" | undefined;

  const orders = await prisma.order.findMany({
    where: {
      merchantId,
      status: type
        ? { equals: type }
        : { in: ["underpayment", "overpayment", "unmatched"] },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      orderRef:           true,
      customerName:       true,
      status:             true,
      expectedAmountKobo: true,
      receivedAmountKobo: true,
      updatedAt:          true,
    },
  });

  return {
    ok: true,
    data: {
      total: orders.length,
      exceptions: orders.map((o) => {
        const exp = Number(o.expectedAmountKobo);
        const rec = o.receivedAmountKobo != null ? Number(o.receivedAmountKobo) : 0;
        return {
          order_ref:     o.orderRef,
          customer:      o.customerName,
          type:          o.status,
          expected:      naira(exp),
          received:      naira(rec),
          difference:    o.status === "underpayment" ? `${naira(exp - rec)} shortfall` : o.status === "overpayment" ? `${naira(rec - exp)} excess` : "unmatched",
          last_updated:  o.updatedAt.toISOString(),
        };
      }),
    },
  };
}

// ── generate_collection_report ────────────────────────────────────────────────

async function toolGenerateCollectionReport(
  merchantId: string,
  args: Record<string, string>
): Promise<ToolResult> {
  const range = (args["range"] ?? "30d") as "7d" | "30d" | "all";

  let start: Date | null = null;
  if (range !== "all") {
    const days = range === "7d" ? 7 : 30;
    start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));
  }

  const base = {
    merchantId,
    ...(start ? { createdAt: { gte: start } } : {}),
  };

  const [orders, ledgerTotals] = await Promise.all([
    prisma.order.findMany({
      where:  base,
      select: {
        orderRef:           true,
        customerName:       true,
        status:             true,
        expectedAmountKobo: true,
        receivedAmountKobo: true,
        createdAt:          true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ledgerEntry.groupBy({
      by:     ["entryType"],
      _sum:   { amountKobo: true },
      where: {
        order: { merchantId },
        ...(start ? { createdAt: { gte: start } } : {}),
      },
    }),
  ]);

  // Aggregate by status
  const byStatus: Record<string, { count: number; expectedKobo: number; receivedKobo: number }> = {};
  for (const o of orders) {
    const s = o.status as string;
    if (!byStatus[s]) byStatus[s] = { count: 0, expectedKobo: 0, receivedKobo: 0 };
    byStatus[s]!.count++;
    byStatus[s]!.expectedKobo += Number(o.expectedAmountKobo);
    byStatus[s]!.receivedKobo += o.receivedAmountKobo != null ? Number(o.receivedAmountKobo) : 0;
  }

  // Top customers by amount received
  const customerMap = new Map<string, number>();
  for (const o of orders) {
    if (o.receivedAmountKobo != null) {
      const cur = customerMap.get(o.customerName) ?? 0;
      customerMap.set(o.customerName, cur + Number(o.receivedAmountKobo));
    }
  }
  const topCustomers = [...customerMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, kobo]) => ({ customer: name, total_received: naira(kobo) }));

  // Ledger summary
  const ledgerSummary: Record<string, string> = {};
  for (const row of ledgerTotals) {
    ledgerSummary[row.entryType] = naira(Math.abs(Number(row._sum.amountKobo ?? 0)));
  }

  const totalExpected = orders.reduce((s, o) => s + Number(o.expectedAmountKobo), 0);
  const totalReceived = orders.reduce((s, o) => s + (o.receivedAmountKobo != null ? Number(o.receivedAmountKobo) : 0), 0);
  const paidOrders   = orders.filter((o) => o.status === "paid" || o.status === "overpayment" || o.status === "refunded");
  const successRate  = orders.length > 0 ? ((paidOrders.length / orders.length) * 100).toFixed(1) : "0.0";
  const collRate     = totalExpected > 0 ? ((totalReceived / totalExpected) * 100).toFixed(1) : "0.0";

  // Daily trend (last 7 days regardless of range, for trend context)
  const trendStart = new Date();
  trendStart.setUTCHours(0, 0, 0, 0);
  trendStart.setUTCDate(trendStart.getUTCDate() - 6);
  const trendOrders = orders.filter((o) => o.createdAt >= trendStart);
  const trendMap = new Map<string, { received: number; count: number }>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setUTCDate(d.getUTCDate() - i);
    trendMap.set(d.toISOString().split("T")[0]!, { received: 0, count: 0 });
  }
  for (const o of trendOrders) {
    const key = o.createdAt.toISOString().split("T")[0]!;
    const bucket = trendMap.get(key);
    if (bucket) {
      bucket.count++;
      if (o.receivedAmountKobo != null) bucket.received += Number(o.receivedAmountKobo);
    }
  }
  const daily_trend = [...trendMap.entries()].map(([date, b]) => ({
    date,
    orders:   b.count,
    received: naira(b.received),
  }));

  return {
    ok: true,
    data: {
      report_type:      "collection_report",
      range_label:      range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "All time",
      generated_at:     new Date().toISOString(),
      summary: {
        total_orders:      orders.length,
        total_expected:    naira(totalExpected),
        total_received:    naira(totalReceived),
        collection_rate:   `${collRate}%`,
        success_rate:      `${successRate}%`,
        exceptions_count:  orders.filter((o) => ["underpayment", "overpayment", "unmatched"].includes(o.status)).length,
      },
      by_status: Object.fromEntries(
        Object.entries(byStatus).map(([status, v]) => [
          status,
          {
            count:    v.count,
            expected: naira(v.expectedKobo),
            received: naira(v.receivedKobo),
          },
        ])
      ),
      top_customers:    topCustomers,
      ledger_movements: ledgerSummary,
      daily_trend,
    },
  };
}

// ── get_recent_transactions ───────────────────────────────────────────────────

async function toolGetRecentTransactions(
  merchantId: string,
  args: Record<string, string>
): Promise<ToolResult> {
  const limit     = Math.min(parseInt(args["limit"] ?? "10", 10) || 10, 20);
  const entryType = args["entry_type"] as string | undefined;

  const entries = await prisma.ledgerEntry.findMany({
    where: {
      order: { merchantId },
      ...(entryType ? { entryType: entryType as never } : {}),
    },
    orderBy: { createdAt: "desc" },
    take:    limit,
    select: {
      entryType:   true,
      amountKobo:  true,
      reference:   true,
      narration:   true,
      createdAt:   true,
      order: {
        select: {
          orderRef:     true,
          customerName: true,
        },
      },
    },
  });

  return {
    ok: true,
    data: {
      count: entries.length,
      transactions: entries.map((e) => ({
        type:       e.entryType,
        direction:  Number(e.amountKobo) >= 0 ? "credit" : "debit",
        amount:     naira(Math.abs(Number(e.amountKobo))),
        order_ref:  e.order.orderRef,
        customer:   e.order.customerName,
        narration:  e.narration ?? null,
        reference:  e.reference ?? null,
        date:       e.createdAt.toISOString(),
      })),
    },
  };
}

// ── get_merchant_info ─────────────────────────────────────────────────────────

async function toolGetMerchantInfo(merchantId: string): Promise<ToolResult> {
  const merchant = await prisma.merchant.findUnique({
    where:  { id: merchantId },
    select: {
      name:                   true,
      email:                  true,
      webhookUrl:             true,
      emailVerified:          true,
      apiKeyPrefix:           true,
      apiKeyIssuedAt:         true,
      apiKeyExpiresAt:        true,
      settlementAccountNumber: true,
      settlementBankCode:     true,
      suspended:              true,
      createdAt:              true,
    },
  });

  if (!merchant) return { ok: false, error: "Merchant not found" };

  return {
    ok: true,
    data: {
      name:               merchant.name,
      email:              merchant.email,
      email_verified:     merchant.emailVerified,
      webhook_url:        merchant.webhookUrl ?? "Not configured",
      api_key_prefix:     merchant.apiKeyPrefix ?? "No key issued",
      api_key_issued_at:  merchant.apiKeyIssuedAt?.toISOString() ?? null,
      api_key_expires_at: merchant.apiKeyExpiresAt?.toISOString() ?? "Never",
      settlement_account: merchant.settlementAccountNumber ?? "Not configured",
      settlement_bank:    merchant.settlementBankCode ?? null,
      account_suspended:  merchant.suspended,
      member_since:       merchant.createdAt.toISOString(),
    },
  };
}
