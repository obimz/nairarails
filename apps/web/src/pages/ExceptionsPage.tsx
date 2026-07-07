import React from "react";
import { AlertTriangle, RefreshCw, CheckCircle2, X } from "lucide-react";
import {
  useExceptions,
  useRefundExcess,
  useRefundShortfall,
  type Exception,
  type ExceptionType,
} from "../hooks/index.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { formatNaira } from "../lib/money.js";
import { useToast } from "../contexts/ToastContext.js";

// ─── Confirmation modal ───────────────────────────────────────────────────────

interface ConfirmModalProps {
  title:      string;
  body:       string;
  confirmLabel: string;
  danger?:    boolean;
  loading?:   boolean;
  onConfirm:  () => void;
  onCancel:   () => void;
}

function ConfirmModal({ title, body, confirmLabel, danger, loading, onConfirm, onCancel }: ConfirmModalProps) {
  // Close on Escape key
  React.useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") onCancel(); }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onCancel}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-xl"
        style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 p-1 rounded-lg cursor-pointer"
          style={{ color: "var(--text-muted)" }}
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 id="modal-title" className="text-base font-semibold mb-2"
            style={{ color: "var(--text-primary)" }}>
          {title}
        </h3>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>{body}</p>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-all flex items-center gap-2"
            style={{
              background: danger ? "rgba(239,68,68,0.15)" : "rgba(22,169,123,0.15)",
              border: `1px solid ${danger ? "rgba(239,68,68,0.35)" : "rgba(22,169,123,0.35)"}`,
              color: danger ? "#f87171" : "#16A97B",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading && <div className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />}
            {loading ? "Processing…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS: { type: ExceptionType; label: string }[] = [
  { type: "overpayment",  label: "Overpayments" },
  { type: "underpayment", label: "Underpayments" },
  { type: "unmatched",    label: "Unmatched" },
];

// ─── Exception row ────────────────────────────────────────────────────────────

function ExceptionRow({ exception }: { exception: Exception }) {
  const refundExcess     = useRefundExcess();
  const refundShortfall  = useRefundShortfall();
  const toast = useToast();

  const [confirmModal, setConfirmModal] = React.useState<null | "excess" | "shortfall">(null);

  const isOverpayment  = exception.type === "overpayment";
  const isUnderpayment = exception.type === "underpayment";

  const excessResolved    = refundExcess.isSuccess    && refundExcess.variables    === exception.order_ref;
  const shortfallResolved = refundShortfall.isSuccess && refundShortfall.variables === exception.order_ref;
  const isResolved = exception.resolved || excessResolved || shortfallResolved;

  return (
    <>
      {confirmModal === "excess" && (
        <ConfirmModal
          title="Refund overpayment excess?"
          body={`This will transfer ${formatNaira(exception.excess_kobo)} back to the original sender. This action cannot be undone.`}
          confirmLabel={`Refund ${formatNaira(exception.excess_kobo)}`}
          danger
          loading={refundExcess.isPending}
          onConfirm={() => {
            refundExcess.mutate(exception.order_ref, {
              onSuccess: () => {
                setConfirmModal(null);
                toast.success(`Excess of ${formatNaira(exception.excess_kobo)} refunded`, "Refund sent");
              },
              onError: (err) => {
                setConfirmModal(null);
                toast.error(err.message, "Refund failed");
              },
            });
          }}
          onCancel={() => setConfirmModal(null)}
        />
      )}
      {confirmModal === "shortfall" && (
        <ConfirmModal
          title="Refund underpayment to buyer?"
          body={`This will return ${formatNaira(exception.received_amount_kobo)} to the original sender and close the order. This action cannot be undone.`}
          confirmLabel={`Refund ${formatNaira(exception.received_amount_kobo)}`}
          danger
          loading={refundShortfall.isPending}
          onConfirm={() => {
            refundShortfall.mutate(exception.order_ref, {
              onSuccess: () => {
                setConfirmModal(null);
                toast.success(`${formatNaira(exception.received_amount_kobo)} returned to buyer`, "Refund sent");
              },
              onError: (err) => {
                setConfirmModal(null);
                toast.error(err.message, "Refund failed");
              },
            });
          }}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      <tr>
        <td>
          <span className="font-mono text-sm text-slate-200">{exception.order_ref}</span>
        </td>
        <td><StatusBadge status={exception.type} /></td>
        <td className="font-mono tabular-nums">{formatNaira(exception.expected_amount_kobo)}</td>
        <td className="font-mono tabular-nums">{formatNaira(exception.received_amount_kobo)}</td>
        <td className="font-mono tabular-nums">
          {isUnderpayment && (
            <span className="text-red-400">−{formatNaira(exception.shortfall_kobo)}</span>
          )}
          {isOverpayment && (
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
          {isResolved ? (
            <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Resolved
            </span>
          ) : isOverpayment ? (
            <button
              type="button"
              onClick={() => setConfirmModal("excess")}
              disabled={refundExcess.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
              style={{
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.30)",
                color: "#f87171",
              }}
            >
              Refund Excess
            </button>
          ) : isUnderpayment ? (
            <button
              type="button"
              onClick={() => setConfirmModal("shortfall")}
              disabled={refundShortfall.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all"
              style={{
                background: "rgba(239,68,68,0.10)",
                border: "1px solid rgba(239,68,68,0.30)",
                color: "#f87171",
              }}
            >
              Refund to Buyer
            </button>
          ) : (
            <span className="text-xs text-slate-600">Manual review</span>
          )}
        </td>
      </tr>
    </>
  );
}

// ─── Section table ────────────────────────────────────────────────────────────

const SECTION_DESCRIPTIONS: Record<ExceptionType, string> = {
  overpayment:  "Buyer paid more than required. Splits ran on the expected amount. Excess is held — refund it to the sender.",
  underpayment: "Buyer paid less than required. No splits have executed. Refund what was received to the sender.",
  unmatched:    "Payment arrived but could not be linked to any order. Manual investigation required — contact support.",
};

function ExceptionTable({ type, items }: { type: ExceptionType; items: Exception[] }) {
  if (items.length === 0) {
    return (
      <div className="card-dark p-12 text-center">
        <CheckCircle2 className="w-8 h-8 text-green-500/30 mx-auto mb-3" />
        <p className="text-sm font-medium text-slate-400">No {type} exceptions</p>
        <p className="text-xs text-slate-600 mt-1">All payments in this category are resolved.</p>
      </div>
    );
  }

  return (
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
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ExceptionsPage() {
  const [activeTab, setActiveTab] = React.useState<ExceptionType>("overpayment");
  const { data, isLoading, isError, error, refetch } = useExceptions();
  const toast = useToast();

  React.useEffect(() => {
    if (isError) toast.error(error.message, "Failed to load exceptions");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error?.message]);

  if (isLoading) {
    return (
      <div className="p-4 md:p-8 flex items-center gap-3 text-slate-500 text-sm">
        <div className="w-4 h-4 border-2 border-slate-700 border-t-green-500 rounded-full animate-spin" />
        Loading exceptions…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Exception Queue</h2>
          <button type="button" onClick={() => void refetch()} className="btn-ghost text-xs gap-2 cursor-pointer">
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
        <div className="card-dark p-12 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3" style={{ color: "rgba(239,68,68,0.4)" }} />
          <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Couldn't load exceptions</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>Check the notification for details.</p>
        </div>
      </div>
    );
  }

  const all    = data?.results ?? [];
  const total  = data?.total_count ?? 0;
  const byType = (type: ExceptionType) => all.filter((e) => e.type === type);
  const counts: Record<ExceptionType, number> = {
    overpayment:  byType("overpayment").length,
    underpayment: byType("underpayment").length,
    unmatched:    byType("unmatched").length,
  };

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-50">Exception Queue</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {total === 0
              ? "No open exceptions — all payments reconciled cleanly."
              : `${total} open exception${total !== 1 ? "s" : ""} requiring attention`}
          </p>
        </div>
        <button type="button" onClick={() => void refetch()}
                className="btn-ghost text-xs gap-2 cursor-pointer">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 mb-6 p-1 rounded-xl"
           style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", width: "fit-content" }}>
        {TABS.map(({ type, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => setActiveTab(type)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
            style={{
              background: activeTab === type ? "var(--bg-surface)" : "transparent",
              color: activeTab === type ? "var(--text-primary)" : "var(--text-muted)",
              border: activeTab === type ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            {label}
            {counts[type] > 0 && (
              <span
                className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold"
                style={{
                  background: activeTab === type ? "rgba(22,169,123,0.20)" : "var(--bg-glass)",
                  color: activeTab === type ? "#16A97B" : "var(--text-muted)",
                }}
              >
                {counts[type]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Description */}
      <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
        {SECTION_DESCRIPTIONS[activeTab]}
      </p>

      {/* Active tab table */}
      <ExceptionTable type={activeTab} items={byType(activeTab)} />
    </div>
  );
}
