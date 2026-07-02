/**
 * OrdersPage — filterable orders table with inline reconciliation detail drawer.
 *
 * Click any row → drawer slides in from the right showing:
 *   - Full reconciliation detail (expected vs received, shortfall/excess)
 *   - Splits breakdown (party, %, amount, status, transfer ref)
 *   - Audit trail timeline
 */

import React from "react";
import { useOrders, useReconciliation, type OrderListItem, type ReconciliationDetail, type SplitResult, type AuditEntry } from "../hooks/index.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { formatNaira } from "../lib/money.js";

type StatusFilter = OrderListItem["status"] | "all";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all",         label: "All" },
  { value: "pending",     label: "Pending" },
  { value: "paid",        label: "Paid" },
  { value: "underpayment",label: "Underpayment" },
  { value: "overpayment", label: "Overpayment" },
  { value: "unmatched",   label: "Unmatched" },
];

// ─── Split status colour ──────────────────────────────────────────────────────

function splitStatusClass(status: SplitResult["status"]): string {
  return {
    executed: "text-green-600",
    pending:  "text-yellow-600",
    blocked:  "text-red-600",
    failed:   "text-red-700",
  }[status] ?? "text-gray-500";
}

// ─── Reconciliation drawer ────────────────────────────────────────────────────

interface DrawerProps {
  orderRef: string;
  onClose:  () => void;
}

function ReconciliationDrawer({ orderRef, onClose }: DrawerProps) {
  const { data, isLoading, isError, error } = useReconciliation(orderRef);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 flex flex-col"
        aria-label="Reconciliation detail"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Reconciliation Detail</p>
            <h3 className="font-semibold text-gray-900 font-mono">{orderRef}</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
              <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-300 border-t-green-500 rounded-full" />
              Loading…
            </div>
          )}

          {isError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
              {error.message}
            </div>
          )}

          {data && <DrawerContent detail={data} />}
        </div>
      </aside>
    </>
  );
}

function DrawerContent({ detail }: { detail: ReconciliationDetail }) {
  const {
    virtual_account_number,
    expected_amount_kobo,
    received_amount_kobo,
    status,
    shortfall_kobo,
    excess_kobo,
    splits_executed,
    splits,
    audit_trail,
  } = detail;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <SummaryCard label="Status">
          <StatusBadge status={status} />
        </SummaryCard>
        <SummaryCard label="Virtual Account">
          <span className="font-mono text-sm">{virtual_account_number || "—"}</span>
        </SummaryCard>
        <SummaryCard label="Expected">
          <span className="font-semibold">{formatNaira(expected_amount_kobo)}</span>
        </SummaryCard>
        <SummaryCard label="Received">
          <span className="font-semibold">
            {received_amount_kobo !== null ? formatNaira(received_amount_kobo) : "—"}
          </span>
        </SummaryCard>
        {shortfall_kobo > 0 && (
          <SummaryCard label="Shortfall">
            <span className="font-semibold text-red-600">{formatNaira(shortfall_kobo)}</span>
          </SummaryCard>
        )}
        {excess_kobo > 0 && (
          <SummaryCard label="Excess">
            <span className="font-semibold text-purple-600">{formatNaira(excess_kobo)}</span>
          </SummaryCard>
        )}
      </div>

      {/* Splits */}
      {splits.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">
            Splits {splits_executed && <span className="text-green-600 font-normal">(executed)</span>}
          </h4>
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500">
                  <th className="px-3 py-2 text-left font-medium">Party</th>
                  <th className="px-3 py-2 text-right font-medium">%</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((s) => (
                  <tr key={s.party} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-medium capitalize">{s.party}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{s.percentage}%</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {s.amount_paid_kobo !== null ? formatNaira(s.amount_paid_kobo) : "—"}
                    </td>
                    <td className={`px-3 py-2 capitalize text-xs font-medium ${splitStatusClass(s.status)}`}>
                      {s.status}
                      {s.nomba_transfer_ref && (
                        <span className="block text-gray-400 font-normal font-mono text-xs truncate max-w-[120px]">
                          {s.nomba_transfer_ref}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Audit trail */}
      <section>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Audit Trail</h4>
        <ol className="relative border-l-2 border-gray-200 ml-2 space-y-4">
          {audit_trail.map((entry, i) => (
            <AuditItem key={i} entry={entry} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <div>{children}</div>
    </div>
  );
}

function AuditItem({ entry }: { entry: AuditEntry }) {
  const eventLabel: Record<string, string> = {
    va_created:       "Virtual account created",
    payment_received: "Payment received",
    classified:       "Payment classified",
    split_payout:     "Split payout sent",
    refund_issued:    "Excess refunded",
    adjustment:       "Manual adjustment",
  };

  return (
    <li className="ml-4 relative">
      <div className="absolute -left-[1.375rem] top-1 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" />
      <p className="text-sm font-medium text-gray-800">
        {eventLabel[entry.event] ?? entry.event}
      </p>
      {entry.amount_kobo !== undefined && (
        <p className="text-xs text-gray-500">
          {entry.amount_kobo < 0
            ? `−${formatNaira(Math.abs(entry.amount_kobo))}`
            : formatNaira(entry.amount_kobo)}
        </p>
      )}
      {entry.detail && (
        <p className="text-xs text-gray-400">{entry.detail}</p>
      )}
      <p className="text-xs text-gray-400 mt-0.5">
        {new Date(entry.timestamp).toLocaleString("en-NG", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
        })}
      </p>
    </li>
  );
}

// ─── Orders table row ─────────────────────────────────────────────────────────

interface RowProps {
  order:    OrderListItem;
  onClick:  () => void;
  selected: boolean;
}

function OrderRow({ order, onClick, selected }: RowProps) {
  return (
    <tr
      onClick={onClick}
      className={[
        "border-t border-gray-100 cursor-pointer transition-colors",
        selected ? "bg-green-50" : "hover:bg-gray-50",
      ].join(" ")}
    >
      <td className="px-4 py-3 font-mono text-sm text-gray-900">{order.order_ref}</td>
      <td className="px-4 py-3 text-sm text-gray-700">{order.customer_name}</td>
      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">
        {formatNaira(order.expected_amount_kobo)}
      </td>
      <td className="px-4 py-3 text-sm tabular-nums text-gray-700">
        {order.received_amount_kobo !== null ? formatNaira(order.received_amount_kobo) : "—"}
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={order.status} />
      </td>
      <td className="px-4 py-3 font-mono text-xs text-gray-400">
        {order.virtual_account_number || "—"}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {new Date(order.created_at).toLocaleString("en-NG", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        })}
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs">
        {selected ? "▲ Open" : "▶"}
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OrdersPage() {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [selectedRef, setSelectedRef]   = React.useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useOrders(
    statusFilter === "all" ? undefined : statusFilter
  );

  const orders = data?.results ?? [];

  const handleRowClick = (orderRef: string) => {
    setSelectedRef((prev) => (prev === orderRef ? null : orderRef));
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="section-title text-xl">Orders</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {data ? `${data.total_count} order${data.total_count !== 1 ? "s" : ""}` : "Loading…"}
          </p>
        </div>
        <button onClick={() => void refetch()} className="btn-ghost text-xs">
          ↻ Refresh
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 mb-4 flex-wrap">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => { setStatusFilter(value); setSelectedRef(null); }}
            className={[
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
              statusFilter === value
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-12 justify-center">
          <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-300 border-t-green-500 rounded-full" />
          Loading orders…
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          <strong>Failed to load orders:</strong> {error.message}
          <button onClick={() => void refetch()} className="ml-4 underline">Retry</button>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {orders.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">
              No orders found{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order Ref</th>
                    <th>Customer</th>
                    <th>Expected</th>
                    <th>Received</th>
                    <th>Status</th>
                    <th>NUBAN</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <OrderRow
                      key={order.order_ref}
                      order={order}
                      onClick={() => handleRowClick(order.order_ref)}
                      selected={selectedRef === order.order_ref}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reconciliation drawer */}
      {selectedRef && (
        <ReconciliationDrawer
          orderRef={selectedRef}
          onClose={() => setSelectedRef(null)}
        />
      )}
    </div>
  );
}
