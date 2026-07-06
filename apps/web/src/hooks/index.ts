/**
 * hooks/index.ts — all TanStack Query hooks for NairaRails.
 *
 * Every hook reads VITE_API_BASE through apiFetch, so swapping from the mock
 * server to the real API in Phase 9 is a single env-var change.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/apiFetch.js";

// ─── Response shape types ────────────────────────────────────────────────────
// Mirrors the API contract exactly. Not importing from shared-types because
// the frontend tsconfig targets Bundler resolution and shared-types builds to
// CommonJS/NodeNext — simpler to keep plain TypeScript interfaces here.

export interface OrderListItem {
  order_ref:              string;
  customer_name:          string;
  expected_amount_kobo:   number;
  received_amount_kobo:   number | null;
  status:                 "pending" | "paid" | "underpayment" | "overpayment" | "unmatched" | "refunded" | "expired";
  virtual_account_number: string;
  created_at:             string;
}

export interface OrderListResponse {
  results:     OrderListItem[];
  page:        number;
  page_size:   number;
  total_count: number;
}

export interface SplitResult {
  party:              string;
  percentage:         number;
  amount_paid_kobo:   number | null;
  status:             "pending" | "executed" | "blocked" | "failed";
  nomba_transfer_ref: string | null;
}

export interface AuditEntry {
  event:        string;
  amount_kobo?: number;
  timestamp:    string;
  detail?:      string;
  reference?:   string;
}

export interface ReconciliationDetail {
  order_ref:              string;
  virtual_account_number: string;
  expected_amount_kobo:   number;
  received_amount_kobo:   number | null;
  status:                 OrderListItem["status"];
  shortfall_kobo:         number;
  excess_kobo:            number;
  splits_executed:        boolean;
  splits:                 SplitResult[];
  audit_trail:            AuditEntry[];
}

export type ExceptionType = "underpayment" | "overpayment" | "unmatched";

export interface Exception {
  order_ref:            string;
  type:                 ExceptionType;
  expected_amount_kobo: number;
  received_amount_kobo: number;
  shortfall_kobo:       number;
  excess_kobo:          number;
  raised_at:            string;
  resolved:             boolean;
  resolved_at:          string | null;
}

export interface ExceptionListResponse {
  results:     Exception[];
  total_count: number;
}

export interface DashboardOverview {
  date:                       string;
  total_expected_today_kobo:  number;
  total_received_today_kobo:  number;
  orders_paid:                number;
  orders_pending:             number;
  orders_underpayment:        number;
  orders_overpayment:         number;
  exceptions_open:            number;
}

export interface RefundExcessResponse {
  order_ref:            string;
  refunded_amount_kobo: number;
  sender_account:       string;
  sender_bank:          string;
  status:               string;
  nomba_transfer_ref:   string;
}

// ─── Query keys ──────────────────────────────────────────────────────────────
// Centralised so invalidations are consistent everywhere.
export const QUERY_KEYS = {
  orders:           (status?: string) => status ? ["orders", status] : ["orders"],
  reconciliation:   (orderRef: string) => ["reconciliation", orderRef],
  exceptions:       (type?: string)   => type ? ["exceptions", type] : ["exceptions"],
  dashboard:        () => ["dashboard"],
} as const;

// ─── useOrders ───────────────────────────────────────────────────────────────
export function useOrders(filters?: { status?: string; date_from?: string; date_to?: string }) {
  const qs = new URLSearchParams();
  if (filters?.status)    qs.set("status",    filters.status);
  if (filters?.date_from) qs.set("date_from", filters.date_from);
  if (filters?.date_to)   qs.set("date_to",   filters.date_to);
  const query = qs.toString();
  return useQuery<OrderListResponse>({
    queryKey: ["orders", filters],
    queryFn:  () => apiGet<OrderListResponse>(`/api/v1/orders${query ? `?${query}` : ""}`),
  });
}

// ─── useReconciliation ───────────────────────────────────────────────────────
export function useReconciliation(orderRef: string, enabled = true) {
  return useQuery<ReconciliationDetail>({
    queryKey: QUERY_KEYS.reconciliation(orderRef),
    queryFn:  () => apiGet<ReconciliationDetail>(`/api/v1/orders/${encodeURIComponent(orderRef)}/reconciliation`),
    enabled:  enabled && orderRef.length > 0,
  });
}

// ─── useExceptions ───────────────────────────────────────────────────────────
export function useExceptions(type?: ExceptionType) {
  const qs = type ? `?type=${encodeURIComponent(type)}` : "";
  return useQuery<ExceptionListResponse>({
    queryKey: QUERY_KEYS.exceptions(type),
    queryFn:  () => apiGet<ExceptionListResponse>(`/api/v1/exceptions${qs}`),
    // Exceptions queue is high-priority — refresh every 15 s while the tab is open
    refetchInterval: 15_000,
  });
}

// ─── useDashboard ────────────────────────────────────────────────────────────
export function useDashboard() {
  return useQuery<DashboardOverview>({
    queryKey: QUERY_KEYS.dashboard(),
    queryFn:  () => apiGet<DashboardOverview>("/api/v1/dashboard/overview"),
    refetchInterval: 15_000,
  });
}

// ─── useRefundExcess ─────────────────────────────────────────────────────────
export function useRefundExcess() {
  const qc = useQueryClient();
  return useMutation<RefundExcessResponse, Error, string>({
    mutationFn: (orderRef: string) =>
      apiPost<RefundExcessResponse>(`/api/v1/exceptions/${encodeURIComponent(orderRef)}/refund-excess`),
    onSuccess: () => {
      // Invalidate everything that could reflect the resolved exception
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.exceptions() });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.orders() });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.dashboard() });
    },
  });
}

// ─── useRefundShortfall ──────────────────────────────────────────────────────
export function useRefundShortfall() {
  const qc = useQueryClient();
  return useMutation<RefundExcessResponse, Error, string>({
    mutationFn: (orderRef: string) =>
      apiPost<RefundExcessResponse>(`/api/v1/exceptions/${encodeURIComponent(orderRef)}/refund-shortfall`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.exceptions() });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.orders() });
      void qc.invalidateQueries({ queryKey: QUERY_KEYS.dashboard() });
    },
  });
}
