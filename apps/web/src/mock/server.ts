/**
 * mock/server.ts — lightweight HTTP mock server for Phase 7/8 development.
 *
 * Runs on port 4000 (set VITE_API_BASE=http://localhost:4000 to use it).
 * Mirrors every contract endpoint from 01-API-CONTRACT.md so the frontend
 * can be built and tested without the real Express backend.
 *
 * Start with:   tsx src/mock/server.ts
 * Or via pnpm:  pnpm --filter @nairarails/web mock
 *
 * Mutation routes (POST /orders, POST .../refund-excess) mutate the in-memory
 * clone of MOCK_ORDERS so the UI can see state changes within a session.
 * The server resets to fixture data on restart.
 */

import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MOCK_ORDERS, getMockOverview, type MockOrder } from "./data.js";

const PORT = 4000;

// ─── In-memory mutable state ──────────────────────────────────────────────────
// Deep-clone fixture data so mutations don't bleed between tests.
let orders: MockOrder[] = MOCK_ORDERS.map((o) => ({ ...o, splits: [...o.splits], audit_trail: [...o.audit_trail] }));

function getExceptions() {
  return orders.filter(
    (o) => o.status === "underpayment" || o.status === "overpayment" || o.status === "unmatched"
  );
}

function buildOverview() {
  return {
    date:                       new Date().toISOString().split("T")[0],
    total_expected_today_kobo:  orders.reduce((s, o) => s + o.expected_amount_kobo, 0),
    total_received_today_kobo:  orders.reduce((s, o) => s + (o.received_amount_kobo ?? 0), 0),
    orders_paid:                orders.filter((o) => o.status === "paid").length,
    orders_pending:             orders.filter((o) => o.status === "pending").length,
    orders_underpayment:        orders.filter((o) => o.status === "underpayment").length,
    orders_overpayment:         orders.filter((o) => o.status === "overpayment").length,
    exceptions_open:            getExceptions().length,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type":                "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk: Buffer) => { raw += String(chunk); });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

function notFound(res: ServerResponse, message = "Not found") {
  json(res, 404, { error: { code: "NOT_FOUND", message } });
}

function err422(res: ServerResponse, message: string) {
  json(res, 422, { error: { code: "VALIDATION_ERROR", message } });
}

// ─── Route handler ────────────────────────────────────────────────────────────

const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const method = req.method ?? "GET";
  const url    = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path   = url.pathname;

  // CORS pre-flight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  console.log(`[mock] ${method} ${path}`);

  // ── GET /health ─────────────────────────────────────────────────────────────
  if (method === "GET" && path === "/health") {
    json(res, 200, { status: "healthy", mock: true, timestamp: new Date().toISOString() });
    return;
  }

  // ── GET /api/v1/orders ──────────────────────────────────────────────────────
  if (method === "GET" && path === "/api/v1/orders") {
    const status = url.searchParams.get("status");
    const page   = parseInt(url.searchParams.get("page") ?? "1", 10);
    const size   = parseInt(url.searchParams.get("page_size") ?? "20", 10);

    let results = status
      ? orders.filter((o) => o.status === status)
      : [...orders];

    const total = results.length;
    results = results.slice((page - 1) * size, page * size);

    json(res, 200, {
      results: results.map((o) => ({
        order_ref:              o.order_ref,
        customer_name:          o.customer_name,
        expected_amount_kobo:   o.expected_amount_kobo,
        received_amount_kobo:   o.received_amount_kobo,
        status:                 o.status,
        virtual_account_number: o.virtual_account_number,
        created_at:             o.created_at,
      })),
      page,
      page_size: size,
      total_count: total,
    });
    return;
  }

  // ── POST /api/v1/orders ─────────────────────────────────────────────────────
  if (method === "POST" && path === "/api/v1/orders") {
    const body = await readBody(req) as Record<string, unknown>;
    const order_ref      = body["order_ref"] as string | undefined;
    const customer_name  = body["customer_name"] as string | undefined;
    const expected_kobo  = body["expected_amount_kobo"] as number | undefined;
    const currency       = (body["currency"] as string | undefined) ?? "NGN";
    const splits         = body["splits"] as Array<{ party: string; percentage: number; account_number: string; bank_code: string }> | undefined;

    if (!order_ref || !customer_name || !expected_kobo || !splits) {
      err422(res, "Missing required fields: order_ref, customer_name, expected_amount_kobo, splits");
      return;
    }

    const splitSum = splits.reduce((s, sp) => s + sp.percentage, 0);
    if (splitSum !== 100) {
      err422(res, `splits[].percentage must sum to exactly 100 (got ${splitSum})`);
      return;
    }

    if (orders.find((o) => o.order_ref === order_ref)) {
      json(res, 409, { error: { code: "DUPLICATE_ORDER_REF", message: `Order ref '${order_ref}' already exists` } });
      return;
    }

    // Generate a fake NUBAN for mock purposes.
    const nuban = String(9900000000 + orders.length + 1);

    const newOrder: MockOrder = {
      order_ref,
      customer_name,
      expected_amount_kobo:   expected_kobo,
      received_amount_kobo:   null,
      status:                 "pending",
      virtual_account_number: nuban,
      bank_name:              "Nombank MFB (mock)",
      bank_code:              "000026",
      currency,
      created_at:             new Date().toISOString(),
      shortfall_kobo:         0,
      excess_kobo:            0,
      splits_executed:        false,
      splits: splits.map((sp) => ({
        party:              sp.party,
        percentage:         sp.percentage,
        amount_paid_kobo:   null,
        status:             "pending",
        nomba_transfer_ref: null,
      })),
      audit_trail: [
        { event: "va_created", timestamp: new Date().toISOString() },
      ],
    };

    orders.push(newOrder);

    json(res, 201, {
      order_ref:              newOrder.order_ref,
      virtual_account_number: newOrder.virtual_account_number,
      bank_name:              newOrder.bank_name,
      bank_code:              newOrder.bank_code,
      expected_amount_kobo:   newOrder.expected_amount_kobo,
      currency:               newOrder.currency,
      status:                 newOrder.status,
      created_at:             newOrder.created_at,
    });
    return;
  }

  // ── GET /api/v1/orders/:order_ref/reconciliation ────────────────────────────
  const reconcileMatch = path.match(/^\/api\/v1\/orders\/([^/]+)\/reconciliation$/);
  if (method === "GET" && reconcileMatch) {
    const order_ref = decodeURIComponent(reconcileMatch[1] ?? "");
    const order = orders.find((o) => o.order_ref === order_ref);
    if (!order) { notFound(res, `Order '${order_ref}' not found`); return; }

    json(res, 200, {
      order_ref:              order.order_ref,
      virtual_account_number: order.virtual_account_number,
      expected_amount_kobo:   order.expected_amount_kobo,
      received_amount_kobo:   order.received_amount_kobo,
      status:                 order.status,
      shortfall_kobo:         order.shortfall_kobo,
      excess_kobo:            order.excess_kobo,
      splits_executed:        order.splits_executed,
      splits:                 order.splits,
      audit_trail:            order.audit_trail,
    });
    return;
  }

  // ── GET /api/v1/exceptions ──────────────────────────────────────────────────
  if (method === "GET" && path === "/api/v1/exceptions") {
    const type = url.searchParams.get("type");
    const exceptions = type
      ? getExceptions().filter((o) => o.status === type)
      : getExceptions();

    json(res, 200, {
      results: exceptions.map((o) => ({
        order_ref:            o.order_ref,
        type:                 o.status,
        expected_amount_kobo: o.expected_amount_kobo,
        received_amount_kobo: o.received_amount_kobo ?? 0,
        shortfall_kobo:       o.shortfall_kobo,
        excess_kobo:          o.excess_kobo,
        raised_at:            o.created_at,
        resolved:             false,
        resolved_at:          null,
      })),
      total_count: exceptions.length,
    });
    return;
  }

  // ── POST /api/v1/exceptions/:order_ref/refund-excess ───────────────────────
  const refundMatch = path.match(/^\/api\/v1\/exceptions\/([^/]+)\/refund-excess$/);
  if (method === "POST" && refundMatch) {
    const order_ref = decodeURIComponent(refundMatch[1] ?? "");
    const order = orders.find((o) => o.order_ref === order_ref);

    if (!order) { notFound(res, `Order '${order_ref}' not found`); return; }
    if (order.status !== "overpayment") {
      err422(res, `Order '${order_ref}' is not an overpayment — current status: ${order.status}`);
      return;
    }

    const refundKobo = order.excess_kobo;
    // Mutate mock state: mark resolved.
    order.status = "paid";
    order.audit_trail.push({
      event:       "refund_issued",
      amount_kobo: -refundKobo,
      timestamp:   new Date().toISOString(),
      detail:      `Excess refunded to ${order.sender_account_number ?? "unknown"}`,
    });

    json(res, 200, {
      order_ref,
      refunded_amount_kobo: refundKobo,
      sender_account:       order.sender_account_number ?? "0000000000",
      sender_bank:          order.sender_bank_code ?? "035",
      status:               "resolved",
      nomba_transfer_ref:   `mock_refund_${order_ref}_${Date.now()}`,
    });
    return;
  }

  // ── GET /api/v1/dashboard/overview ─────────────────────────────────────────
  if (method === "GET" && path === "/api/v1/dashboard/overview") {
    json(res, 200, buildOverview());
    return;
  }

  // ── GET /api/v1/admin/reconcile-check ──────────────────────────────────────
  if (method === "GET" && path === "/api/v1/admin/reconcile-check") {
    json(res, 200, {
      checked_at:    new Date().toISOString(),
      date_from:     url.searchParams.get("date_from") ?? new Date().toISOString().split("T")[0],
      date_to:       url.searchParams.get("date_to")   ?? new Date().toISOString().split("T")[0],
      total_checked: orders.length,
      matched:       orders.filter((o) => o.status === "paid").length,
      orphans:       [],
      drift:         [],
      summary:       "Mock reconcile check — no real Nomba data",
    });
    return;
  }

  // ── POST /api/v1/webhooks/nomba ────────────────────────────────────────────
  // Mock stub: always returns 200 ok (no real signature verification).
  if (method === "POST" && path === "/api/v1/webhooks/nomba") {
    json(res, 200, { status: "ok", mock: true });
    return;
  }

  // ── Fallthrough ─────────────────────────────────────────────────────────────
  notFound(res, `Mock server: no route for ${method} ${path}`);
});

server.listen(PORT, () => {
  console.log(`[mock] NairaRails mock server running on http://localhost:${PORT}`);
  console.log(`[mock] Set VITE_API_BASE=http://localhost:${PORT} to use it`);
});
