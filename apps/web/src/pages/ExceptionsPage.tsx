/**
 * ExceptionsPage — grouped exception queue.
 *
 * Shows underpayments, overpayments, and unmatched payments in separate
 * sections. The Refund Excess button on overpayments fires a real mutation
 * against POST /exceptions/:order_ref/refund-excess.
 */

import React from "react";
import { useExceptions, useRefundExcess, type Exception, type ExceptionType } from "../hooks/index.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { formatNaira } from "../lib/money.js";

// ─── Section config ───────────────────────────────────────────────────────────

const SECTIONS: { type: ExceptionType; label: string; description: string }[] = [
  {
    type:        "overpayment",
    label:       "Overpayments",
    description: "Buyer paid more than the order amount. Splits have executed on the expected amount. Excess is quarantined pending refund.",
  },
  {
    type:        "underpayment",
    label:       "Underpayments",
    description: "Buyer paid less than required. Splits are blocked until the shortfall is resolved.",
  },
  {
    type:        "unmatched",
    label:       "Unmatched Payments",
    description: "Payment arrived with no matching order reference. Funds are quarantined — manual review required.",
  },
];

// ─── Single exception row ─────────────────────────────────────────────────────

interface ExceptionRowProps {
  exception: Exception;
}

function ExceptionRow({ exception }: ExceptionRowProps) {
  const refundMutation = useRefundExcess();
  const isRefunding    = refundMutation.isPending;
  const isResolved     = refundMutation.isSuccess && refundMutation.variables === exception.order_ref;

  const handleRefund = () => {
    if (isRefunding) return;
    refundMutation.mutate(exception.order_ref);
  };

  return (
    <tr className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
      {/* Order ref */}
      <td className="px-4 py-3">
        <span className="font-mono text-sm text-gray-900">{exception.order_ref}</span>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={exception.type} />
      </td>

      {/* Expected */}
      <td className="px-4 py-3 text-sm text-gray-700 tabular-nums">
        {formatNaira(exception.expected_amount_kobo)}
      </td>

      {/* Received */}
      <td className="px-4 py-3 text-sm text-gray-700 tabular-nums">
        {formatNaira(exception.received_amount_kobo)}
      </td>

      {/* Delta */}
      <td className="px-4 py-3 text-sm tabular-nums">
        {exception.type === "underpayment" && (
          <span className="text-red-600">−{formatNaira(exception.shortfall_kobo)}</span>
        )}
        {exception.type === "overpayment" && (
          <span className="text-purple-600">+{formatNaira(exception.excess_kobo)}</span>
        )}
        {exception.type === "unmatched" && (
          <span className="text-gray-400">—</span>
        )}
      </td>

      {/* Raised at */}
      <td className="px-4 py-3 text-xs text-gray-500">
        {new Date(exception.raised_at).toLocaleString("en-NG", {
          day:    "2-digit",
          month:  "short",
          hour:   "2-digit",
          minute: "2-digit",
        })}
      </td>

      {/* Action */}
      <td className="px-4 py-3">
        {exception.type === "overpayment" && !exception.resolved && (
          <button
            onClick={handleRefund}
            disabled={isRefunding || isResolved}
            className="btn-danger text-xs px-3 py-1.5"
          >
            {isRefunding && refundMutation.variables === exception.order_ref
              ? "Refunding…"
              : isResolved
                ? "Refunded ✓"
                : `Refund ${formatNaira(exception.excess_kobo)}`}
          </button>
        )}
        {exception.resolved && (
          <span className="text-xs text-green-600 font-medium">Resolved</span>
        )}
        {(exception.type === "underpayment" || exception.type === "unmatched") && (
          <span className="text-xs text-gray-400">Manual review</span>
        )}
        {/* Show mutation error inline */}
        {refundMutation.isError && refundMutation.variables === exception.order_ref && (
          <p className="text-xs text-red-500 mt-1">
            {refundMutation.error.message}
          </p>
        )}
      </td>
    </tr>
  );
}

// ─── Exception section ────────────────────────────────────────────────────────

interface ExceptionSectionProps {
  type:        ExceptionType;
  label:       string;
  description: string;
  items:       Exception[];
}

function ExceptionSection({ type, label, description, items }: ExceptionSectionProps) {
  if (items.length === 0) return null;

  return (
    <section className="mb-8">
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="section-title">{label}</h3>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-700 text-xs font-bold">
            {items.length}
          </span>
        </div>
        <p className="text-sm text-gray-500">{description}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
      <div className="p-8 flex items-center gap-2 text-gray-500 text-sm">
        <span className="animate-spin inline-block w-4 h-4 border-2 border-gray-300 border-t-green-500 rounded-full" />
        Loading exceptions…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          <strong>Failed to load exceptions:</strong> {error.message}
          <button onClick={() => void refetch()} className="ml-4 underline">Retry</button>
        </div>
      </div>
    );
  }

  const all       = data?.results ?? [];
  const total     = data?.total_count ?? 0;

  const byType = (type: ExceptionType) => all.filter((e) => e.type === type);

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="section-title text-xl">Exception Queue</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {total === 0
              ? "No open exceptions — all payments reconciled cleanly."
              : `${total} open exception${total !== 1 ? "s" : ""} requiring attention`}
          </p>
        </div>
        <button
          onClick={() => void refetch()}
          className="btn-ghost text-xs"
        >
          ↻ Refresh
        </button>
      </div>

      {total === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
          <div className="text-4xl mb-3">✓</div>
          <p className="text-gray-600 font-medium">No exceptions</p>
          <p className="text-gray-400 text-sm mt-1">All payments have been reconciled cleanly.</p>
        </div>
      ) : (
        <>
          {SECTIONS.map(({ type, label, description }) => (
            <ExceptionSection
              key={type}
              type={type}
              label={label}
              description={description}
              items={byType(type)}
            />
          ))}
        </>
      )}
    </div>
  );
}
