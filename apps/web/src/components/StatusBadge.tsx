interface StatusBadgeProps {
  status: string;
}

const STATUS_MAP: Record<string, string> = {
  paid:         "badge-paid",
  pending:      "badge-pending",
  underpayment: "badge-underpayment",
  overpayment:  "badge-overpayment",
  unmatched:    "badge-unmatched",
  expired:      "badge-expired",
  refunded:     "badge-unmatched",  // neutral grey — closed/resolved state
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const cls = STATUS_MAP[status] ?? "badge-unmatched";
  return (
    <span className={cls}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
