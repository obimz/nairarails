/**
 * mock/data.ts — static fixture data for the mock server.
 *
 * Covers every order status (paid, pending, underpayment, overpayment, unmatched)
 * so every dashboard page has something to render during Phase 7–8 development.
 *
 * Amounts are in kobo throughout. No conversions live here.
 */

// ─── Types (mirror the API contract shapes) ───────────────────────────────────

export interface MockSplit {
  party:              string;
  percentage:         number;
  amount_paid_kobo:   number | null;
  status:             "pending" | "executed" | "blocked" | "failed";
  nomba_transfer_ref: string | null;
}

export interface MockAuditEntry {
  event:       string;
  amount_kobo?: number;
  timestamp:   string;
  detail?:     string;
  reference?:  string;
}

export interface MockOrder {
  order_ref:              string;
  customer_name:          string;
  expected_amount_kobo:   number;
  received_amount_kobo:   number | null;
  status:                 "paid" | "pending" | "underpayment" | "overpayment" | "unmatched";
  virtual_account_number: string;
  bank_name:              string;
  bank_code:              string;
  currency:               string;
  created_at:             string;
  // reconciliation fields
  shortfall_kobo:         number;
  excess_kobo:            number;
  splits_executed:        boolean;
  splits:                 MockSplit[];
  audit_trail:            MockAuditEntry[];
  // sender fields (set after webhook fires)
  sender_name?:           string;
  sender_account_number?: string;
  sender_bank_code?:      string;
}

// ─── Fixture orders ───────────────────────────────────────────────────────────

export const MOCK_ORDERS: MockOrder[] = [
  // ── 1. Exact payment — fully settled ────────────────────────────────────────
  {
    order_ref:              "ord-001",
    customer_name:          "Chisom Traders",
    expected_amount_kobo:   5000000,   // ₦50,000
    received_amount_kobo:   5000000,
    status:                 "paid",
    virtual_account_number: "9900012345",
    bank_name:              "Nombank MFB",
    bank_code:              "000026",
    currency:               "NGN",
    created_at:             "2026-07-01T07:00:00.000Z",
    shortfall_kobo:         0,
    excess_kobo:            0,
    splits_executed:        true,
    sender_name:            "Emeka Okafor",
    sender_account_number:  "0000000000",
    sender_bank_code:       "035",
    splits: [
      { party: "seller",   percentage: 85, amount_paid_kobo: 4250000, status: "executed", nomba_transfer_ref: "txf_split_001_seller" },
      { party: "platform", percentage: 10, amount_paid_kobo: 500000,  status: "executed", nomba_transfer_ref: "txf_split_001_platform" },
      { party: "rider",    percentage: 5,  amount_paid_kobo: 250000,  status: "executed", nomba_transfer_ref: "txf_split_001_rider" },
    ],
    audit_trail: [
      { event: "va_created",       timestamp: "2026-07-01T07:00:00.000Z" },
      { event: "payment_received", amount_kobo: 5000000, timestamp: "2026-07-01T07:15:42.000Z" },
      { event: "classified",       timestamp: "2026-07-01T07:15:42.000Z", detail: "paid" },
      { event: "split_payout",     amount_kobo: -4250000, timestamp: "2026-07-01T07:15:43.000Z", reference: "txf_split_001_seller" },
      { event: "split_payout",     amount_kobo: -500000,  timestamp: "2026-07-01T07:15:44.000Z", reference: "txf_split_001_platform" },
      { event: "split_payout",     amount_kobo: -250000,  timestamp: "2026-07-01T07:15:44.000Z", reference: "txf_split_001_rider" },
    ],
  },

  // ── 2. Underpayment — buyer paid short ──────────────────────────────────────
  {
    order_ref:              "ord-002",
    customer_name:          "Adaeze Foods",
    expected_amount_kobo:   3000000,   // ₦30,000
    received_amount_kobo:   2500000,   // ₦25,000 — ₦5,000 short
    status:                 "underpayment",
    virtual_account_number: "9900022222",
    bank_name:              "Nombank MFB",
    bank_code:              "000026",
    currency:               "NGN",
    created_at:             "2026-07-01T08:00:00.000Z",
    shortfall_kobo:         500000,
    excess_kobo:            0,
    splits_executed:        false,
    sender_name:            "Adaeze Okwu",
    sender_account_number:  "0000000000",
    sender_bank_code:       "035",
    splits: [
      { party: "seller",   percentage: 85, amount_paid_kobo: null, status: "blocked", nomba_transfer_ref: null },
      { party: "platform", percentage: 10, amount_paid_kobo: null, status: "blocked", nomba_transfer_ref: null },
      { party: "rider",    percentage: 5,  amount_paid_kobo: null, status: "blocked", nomba_transfer_ref: null },
    ],
    audit_trail: [
      { event: "va_created",       timestamp: "2026-07-01T08:00:00.000Z" },
      { event: "payment_received", amount_kobo: 2500000, timestamp: "2026-07-01T08:22:10.000Z" },
      { event: "classified",       timestamp: "2026-07-01T08:22:10.000Z", detail: "underpayment — shortfall 500000 kobo" },
    ],
  },

  // ── 3. Overpayment — buyer paid too much ────────────────────────────────────
  {
    order_ref:              "ord-003",
    customer_name:          "Tunde Logistics",
    expected_amount_kobo:   2000000,   // ₦20,000
    received_amount_kobo:   2500000,   // ₦25,000 — ₦5,000 excess
    status:                 "overpayment",
    virtual_account_number: "9900033333",
    bank_name:              "Nombank MFB",
    bank_code:              "000026",
    currency:               "NGN",
    created_at:             "2026-07-01T08:30:00.000Z",
    shortfall_kobo:         0,
    excess_kobo:            500000,
    splits_executed:        true,
    sender_name:            "Tunde Bello",
    sender_account_number:  "0000000000",
    sender_bank_code:       "035",
    splits: [
      { party: "seller",   percentage: 85, amount_paid_kobo: 1700000, status: "executed", nomba_transfer_ref: "txf_split_003_seller" },
      { party: "platform", percentage: 10, amount_paid_kobo: 200000,  status: "executed", nomba_transfer_ref: "txf_split_003_platform" },
      { party: "rider",    percentage: 5,  amount_paid_kobo: 100000,  status: "executed", nomba_transfer_ref: "txf_split_003_rider" },
    ],
    audit_trail: [
      { event: "va_created",       timestamp: "2026-07-01T08:30:00.000Z" },
      { event: "payment_received", amount_kobo: 2500000, timestamp: "2026-07-01T08:55:01.000Z" },
      { event: "classified",       timestamp: "2026-07-01T08:55:01.000Z", detail: "overpayment — excess 500000 kobo quarantined" },
      { event: "split_payout",     amount_kobo: -1700000, timestamp: "2026-07-01T08:55:02.000Z", reference: "txf_split_003_seller" },
      { event: "split_payout",     amount_kobo: -200000,  timestamp: "2026-07-01T08:55:03.000Z", reference: "txf_split_003_platform" },
      { event: "split_payout",     amount_kobo: -100000,  timestamp: "2026-07-01T08:55:03.000Z", reference: "txf_split_003_rider" },
    ],
  },

  // ── 4. Pending — awaiting payment ───────────────────────────────────────────
  {
    order_ref:              "ord-004",
    customer_name:          "Ngozi Supplies",
    expected_amount_kobo:   1500000,   // ₦15,000
    received_amount_kobo:   null,
    status:                 "pending",
    virtual_account_number: "9900044444",
    bank_name:              "Nombank MFB",
    bank_code:              "000026",
    currency:               "NGN",
    created_at:             "2026-07-01T09:00:00.000Z",
    shortfall_kobo:         0,
    excess_kobo:            0,
    splits_executed:        false,
    splits: [
      { party: "seller",   percentage: 80, amount_paid_kobo: null, status: "pending", nomba_transfer_ref: null },
      { party: "platform", percentage: 15, amount_paid_kobo: null, status: "pending", nomba_transfer_ref: null },
      { party: "rider",    percentage: 5,  amount_paid_kobo: null, status: "pending", nomba_transfer_ref: null },
    ],
    audit_trail: [
      { event: "va_created", timestamp: "2026-07-01T09:00:00.000Z" },
    ],
  },

  // ── 5. Unmatched — payment arrived with no matching order ───────────────────
  {
    order_ref:              "ord-005",
    customer_name:          "Unknown Sender",
    expected_amount_kobo:   0,
    received_amount_kobo:   800000,    // ₦8,000 — no order matched
    status:                 "unmatched",
    virtual_account_number: "9900055555",
    bank_name:              "Nombank MFB",
    bank_code:              "000026",
    currency:               "NGN",
    created_at:             "2026-07-01T09:30:00.000Z",
    shortfall_kobo:         0,
    excess_kobo:            0,
    splits_executed:        false,
    sender_name:            "Unknown",
    sender_account_number:  "0000000000",
    sender_bank_code:       "058",
    splits: [],
    audit_trail: [
      { event: "va_created",        timestamp: "2026-07-01T09:30:00.000Z" },
      { event: "payment_received",  amount_kobo: 800000, timestamp: "2026-07-01T09:45:00.000Z" },
      { event: "classified",        timestamp: "2026-07-01T09:45:00.000Z", detail: "unmatched — quarantined" },
    ],
  },

  // ── 6. A second pending order for list variety ───────────────────────────────
  {
    order_ref:              "ord-006",
    customer_name:          "Kemi Fabrics",
    expected_amount_kobo:   750000,    // ₦7,500
    received_amount_kobo:   null,
    status:                 "pending",
    virtual_account_number: "9900066666",
    bank_name:              "Nombank MFB",
    bank_code:              "000026",
    currency:               "NGN",
    created_at:             "2026-07-01T10:00:00.000Z",
    shortfall_kobo:         0,
    excess_kobo:            0,
    splits_executed:        false,
    splits: [
      { party: "seller",   percentage: 90, amount_paid_kobo: null, status: "pending", nomba_transfer_ref: null },
      { party: "platform", percentage: 10, amount_paid_kobo: null, status: "pending", nomba_transfer_ref: null },
    ],
    audit_trail: [
      { event: "va_created", timestamp: "2026-07-01T10:00:00.000Z" },
    ],
  },
];

// ─── Derived collections ──────────────────────────────────────────────────────

/** Orders in an exception state (underpayment | overpayment | unmatched) */
export const MOCK_EXCEPTIONS = MOCK_ORDERS.filter(
  (o) => o.status === "underpayment" || o.status === "overpayment" || o.status === "unmatched"
);

/** Dashboard overview aggregate */
export function getMockOverview() {
  const today = MOCK_ORDERS; // all orders treated as "today" for mock purposes
  return {
    date:                       new Date().toISOString().split("T")[0],
    total_expected_today_kobo:  today.reduce((s, o) => s + o.expected_amount_kobo, 0),
    total_received_today_kobo:  today.reduce((s, o) => s + (o.received_amount_kobo ?? 0), 0),
    orders_paid:                today.filter((o) => o.status === "paid").length,
    orders_pending:             today.filter((o) => o.status === "pending").length,
    orders_underpayment:        today.filter((o) => o.status === "underpayment").length,
    orders_overpayment:         today.filter((o) => o.status === "overpayment").length,
    exceptions_open:            MOCK_EXCEPTIONS.length,
  };
}
