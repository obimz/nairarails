import React from "react";
import { AlertTriangle, RefreshCw, CheckCircle2 } from "lucide-react";
import { useExceptions, useRefundExcess, type Exception, type ExceptionType } from "../hooks/index.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { formatNaira } from "../lib/money.js";

// ─── Section config ───────────────────────────────────────────────────────────

const SECTIONS: { type: ExceptionType; label: string; description: string }[] = [
  {
    type:        "overpayment",
    label:       "Overpayments",
    description: "Buyer paid more than the order amount. Splits ran on the expected amount. Excess is quarantined pending refund.",
  },
  {
    type:        "underpayment",
    label:       "Underpayments",
    description: "Buyer paid less than required. Splits are blocked until the shortfall is resolved.",
  },
  {
    type:        "unmatched",
    label:       "Unmatched Payments",
    description: "Payment arrived with no matching order reference. Funds quarantined — manual review required.",
  },
];

// ─── Exception row ────────────────────────────────────────────────────────────

function ExceptionRow({ exception }: { exception: Exception }) {
  const refundMutation = useRefundExcess();
  const isRefunding    = refundMutation.isPending && refundMutation.variables === exception.order_ref;
  const isResolved     = refundMutation.isSuccess  && refundMutation.variables === exception.order_ref;

  return (
    <tr>
      <td>
        <span className="font-mono text-sm text-slate-200">{exception.order_ref}</span>
      </td>
      <td><StatusBadge status={exception.type} /></td>
      <td className="font-mono tabular-nums">{formatNaira(exception.expected_amount_kobo)}</td>
      <td className="font-mono tabular-nums">{formatNaira(exception.received_amount_kobo)}</td>
      <td className="font-mono tabular-nums">
        {exception.type === "underpayment" && (
          <span className="text-red-400">−{formatNaira(exception.shortfall_kobo)}</span>
        )}
        {exception.type === "overpayment" && (
          <span className="text-purple-400">+{formatNaira(exception.excess_kobo)}</span>
        )}
        {exception.type === "unmatched" && (
          <span className="text-slate-600">—</span>
        )}
      </td>
      <td className="text-xs text-slate-500">
        {new Date(exception.raised_at).toLocaleString("en-NG", {
          day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
        })}
      </td>
      <td>
        {exception.type === "overpayment" && !exception.resolved && !isResolved && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => refundMutation.mutate(exception.order_ref)}
              disabled={isRefunding}
              className="btn-danger"
            >
              {isRefunding ? "Refunding…" : `Refund ${formatNaira(exception.excess_kobo)}`}
            </button>
            {refundMutation.isError && refundMutation.variables === exception.order_ref && (
              <p className="text-xs text-red-500">{refundMutation.error.message}</p>
            )}
          </div>
        )}
        {(exception.resolved || isResolved) && (
          <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Resolved
          </span>
        )}
        {(exception.type === "underpayment" || exception.type === "unmatched") && !exception.resolved && (
          <span className="text-xs text-slate-600">Manual review</span>
        )}
      </td>
    </tr>
  );
}

// ─── Exception section ────────────────────────────────────────────────────────

function ExceptionSection({ type, label, description, items }: {
  type: ExceptionType;
  label: string;
  description: string;
  items: Exception[];
}) {
  if (items.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-4">
        <div className="flex items-center gap-2.5 mb-1">
          <h3 className="text-base font-semibold text-slate-100">{label}</h3>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/10 text-slate-400 text-xs font-bold">
            {items.length}
          </span>
        </div>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <div className="card-dark overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Order Ref</th>
              <th>Status</th>
              <th>Expected</th>
              <th>Received</th>
              <th>Delta</th>
              <th>Raised</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((ex) => (
              <ExceptionRow key={ex.order_ref} exception={ex} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ExceptionsPage() {
  const { data, isLoading, isError, error, refetch } = useExceptions();

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-500 text-sm">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-green-500 rounded-full animate-spin" />
        Loading exceptions…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>Failed to load:</strong> {error.message}</span>
          <button onClick={() => void refetch()} className="ml-auto underline">Retry</button>
        </div>
      </div>
    );
  }

  const all   = data?.results ?? [];
  const total = data?.total_count ?? 0;
  const byType = (type: ExceptionType) => all.filter((e) => e.type === type);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">Exception Queue</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {total === 0
              ? "No open exceptions — all payments reconciled cleanly."
              : `${total} open exception${total !== 1 ? "s" : ""} requiring attention`}
          </p>
        </div>
        <button type="button" onClick={() => void refetch()} className="btn-ghost text-xs gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {total === 0 ? (
        <div className="card-dark p-16 text-center">
          <CheckCircle2 className="w-10 h-10 text-green-500/40 mx-auto mb-3" />
          <p className="text-slate-300 font-medium">No exceptions</p>
          <p className="text-slate-600 text-sm mt-1">All payments reconciled cleanly.</p>
        </div>
      ) : (
        SECTIONS.map(({ type, label, description }) => (
          <ExceptionSection
            key={type}
            type={type}
            label={label}
            description={description}
            items={byType(type)}
          />
        ))
      )}
    </div>
  );
}
