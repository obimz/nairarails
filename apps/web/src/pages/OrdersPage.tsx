import React from "react";
import { RefreshCw, X, AlertTriangle } from "lucide-react";
import {
  useOrders,
  useReconciliation,
  type OrderListItem,
  type ReconciliationDetail,
  type SplitResult,
  type AuditEntry,
} from "../hooks/index.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { formatNaira } from "../lib/money.js";

type StatusFilter = OrderListItem["status"] | "all";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all",          label: "All" },
  { value: "pending",      label: "Pending" },
  { value: "paid",         label: "Paid" },
  { value: "underpayment", label: "Underpayment" },
  { value: "overpayment",  label: "Overpayment" },
  { value: "unmatched",    label: "Unmatched" },
];

// ─── Split status color ───────────────────────────────────────────────────────

function splitStatusClass(status: SplitResult["status"]): string {
  return ({
    executed: "text-green-400",
    pending:  "text-amber-400",
    blocked:  "text-red-400",
    failed:   "text-red-500",
  } as Record<string, string>)[status] ?? "text-slate-500";
}

// ─── Reconciliation drawer ────────────────────────────────────────────────────

function ReconciliationDrawer({ orderRef, onClose }: { orderRef: string; onClose: () => void }) {
  const { data, isLoading, isError, error } = useReconciliation(orderRef);

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <aside
        className="fixed right-0 top-0 h-full w-full max-w-xl bg-[#0F172A] border-l border-white/10 shadow-2xl z-50 flex flex-col"
        aria-label="Reconciliation detail"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <p className="text-xs text-slate-500 mb-0.5 uppercase tracking-wider">Reconciliation</p>
            <h3 className="font-semibold text-slate-50 font-mono">{orderRef}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading && (
            <div className="flex items-center justify-center gap-3 text-slate-500 text-sm py-12">
              <div className="w-4 h-4 border-2 border-slate-700 border-t-green-500 rounded-full animate-spin" />
              Loading…
            </div>
          )}
          {isError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
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
    virtual_account_number, expected_amount_kobo, received_amount_kobo,
    status, shortfall_kobo, excess_kobo, splits_executed, splits, audit_trail,
  } = detail;

  return (
    <div className="space-y-6">
      {/* Summary grid */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCard label="Status"><StatusBadge status={status} /></InfoCard>
        <InfoCard label="Virtual Account">
          <span className="font-mono text-xs text-slate-300">{virtual_account_number || "—"}</span>
        </InfoCard>
        <InfoCard label="Expected">
          <span className="font-semibold text-slate-100 tabular-nums">{formatNaira(expected_amount_kobo)}</span>
        </InfoCard>
        <InfoCard label="Received">
          <span className="font-semibold text-slate-100 tabular-nums">
            {received_amount_kobo !== null ? formatNaira(received_amount_kobo) : "—"}
          </span>
        </InfoCard>
        {shortfall_kobo > 0 && (
          <InfoCard label="Shortfall">
            <span className="font-semibold text-red-400 tabular-nums">{formatNaira(shortfall_kobo)}</span>
          </InfoCard>
        )}
        {excess_kobo > 0 && (
          <InfoCard label="Excess">
            <span className="font-semibold text-purple-400 tabular-nums">{formatNaira(excess_kobo)}</span>
          </InfoCard>
        )}
      </div>

      {/* Splits */}
      {splits.length > 0 && (
        <section>
          <h4 className="text-sm font-semibold text-slate-300 mb-3">
            Splits{" "}
            {splits_executed && (
              <span className="text-green-400 font-normal text-xs ml-1">executed</span>
            )}
          </h4>
          <div className="card-dark overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {["Party", "%", "Amount", "Status"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {splits.map((s) => (
                  <tr key={s.party} className="border-t border-white/5">
                    <td className="px-3 py-2 font-medium capitalize text-slate-200">{s.party}</td>
                    <td className="px-3 py-2 text-slate-400 tabular-nums">{s.percentage}%</td>
                    <td className="px-3 py-2 tabular-nums text-slate-200">
                      {s.amount_paid_kobo !== null ? formatNaira(s.amount_paid_kobo) : "—"}
                    </td>
                    <td className={`px-3 py-2 text-xs font-medium capitalize ${splitStatusClass(s.status)}`}>
                      {s.status}
                      {s.nomba_transfer_ref && (
                        <span className="block text-slate-600 font-normal font-mono text-xs truncate max-w-[120px]">
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
        <h4 className="text-sm font-semibold text-slate-300 mb-3">Audit Trail</h4>
        <ol className="relative border-l border-white/10 ml-3 space-y-5">
          {audit_trail.map((entry, i) => (
            <AuditItem key={i} entry={entry} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <div>{children}</div>
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  va_created:       "Virtual account created",
  payment_received: "Payment received",
  classified:       "Payment classified",
  split_payout:     "Split payout sent",
  refund_issued:    "Excess refunded",
  adjustment:       "Manual adjustment",
};

function AuditItem({ entry }: { entry: AuditEntry }) {
  return (
    <li className="ml-5 relative">
      <div className="absolute -left-[1.55rem] top-1.5 w-2 h-2 rounded-full bg-green-500/70 border border-green-500" />
      <p className="text-sm font-medium text-slate-200">
        {EVENT_LABELS[entry.event] ?? entry.event}
      </p>
      {entry.amount_kobo !== undefined && (
        <p className="text-xs text-slate-500 tabular-nums">
          {entry.amount_kobo < 0
            ? `−${formatNaira(Math.abs(entry.amount_kobo))}`
            : formatNaira(entry.amount_kobo)}
        </p>
      )}
      {entry.detail && <p className="text-xs text-slate-600">{entry.detail}</p>}
      <p className="text-xs text-slate-600 mt-0.5">
        {new Date(entry.timestamp).toLocaleString("en-NG", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
        })}
      </p>
    </li>
  );
}

// ─── Order row ────────────────────────────────────────────────────────────────

function OrderRow({ order, onClick, selected }: {
  order: OrderListItem;
  onClick: () => void;
  selected: boolean;
}) {
  return (
    <tr
      onClick={onClick}
      className={[
        "cursor-pointer transition-colors duration-150",
        selected ? "bg-green-500/5 border-t border-green-500/20" : "",
      ].join(" ")}
    >
      <td><span className="font-mono text-sm text-slate-200">{order.order_ref}</span></td>
      <td className="text-slate-300">{order.customer_name}</td>
      <td className="font-mono tabular-nums">{formatNaira(order.expected_amount_kobo)}</td>
      <td className="font-mono tabular-nums">
        {order.received_amount_kobo !== null ? formatNaira(order.received_amount_kobo) : (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td><StatusBadge status={order.status} /></td>
      <td>
        <span className="font-mono text-xs text-slate-600">
          {order.virtual_account_number || "—"}
        </span>
      </td>
      <td className="text-xs text-slate-500">
        {new Date(order.created_at).toLocaleString("en-NG", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        })}
      </td>
      <td>
        <span className="text-xs text-slate-600">{selected ? "▲" : "▶"}</span>
      </td>
    </tr>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OrdersPage() {
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [selectedRef,  setSelectedRef]  = React.useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useOrders(
    statusFilter === "all" ? undefined : statusFilter
  );

  const orders = data?.results ?? [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">Orders</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {data ? `${data.total_count} order${data.total_count !== 1 ? "s" : ""}` : "Loading…"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="btn-ghost text-xs gap-2"
          disabled={isLoading}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1.5 mb-5 flex-wrap">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => { setStatusFilter(value); setSelectedRef(null); }}
            className={[
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer",
              statusFilter === value
                ? "bg-green-500/15 text-green-400 border border-green-500/30"
                : "bg-white/5 text-slate-500 border border-white/10 hover:text-slate-300 hover:bg-white/10",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center gap-3 text-slate-500 text-sm py-16">
          <div className="w-4 h-4 border-2 border-slate-700 border-t-green-500 rounded-full animate-spin" />
          Loading orders…
        </div>
      )}

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>Failed to load:</strong> {error.message}</span>
          <button onClick={() => void refetch()} className="ml-auto underline">Retry</button>
        </div>
      )}

      {/* Table */}
      {!isLoading && !isError && (
        <div className="card-dark overflow-hidden">
          {orders.length === 0 ? (
            <div className="p-16 text-center text-slate-600 text-sm">
              No orders found{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    {["Order Ref", "Customer", "Expected", "Received", "Status", "NUBAN", "Created", ""].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <OrderRow
                      key={order.order_ref}
                      order={order}
                      onClick={() => setSelectedRef((p) => p === order.order_ref ? null : order.order_ref)}
                      selected={selectedRef === order.order_ref}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Drawer */}
      {selectedRef && (
        <ReconciliationDrawer
          orderRef={selectedRef}
          onClose={() => setSelectedRef(null)}
        />
      )}
    </div>
  );
}
