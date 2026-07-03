/**
 * StatusBadge — coloured pill for order/exception status.
 * Uses the .badge-* classes defined in index.css.
 */

import type { OrderListItem } from "../hooks/index.js";

type Status = OrderListItem["status"];

const LABELS: Record<Status, string> = {
  paid:         "Paid",
  pending:      "Pending",
  underpayment: "Underpayment",
  overpayment:  "Overpayment",
  unmatched:    "Unmatched",
};

interface Props {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className = "" }: Props) {
  return (
    <span className={`badge-${status} ${className}`.trim()}>
      {LABELS[status]}
    </span>
  );
}
