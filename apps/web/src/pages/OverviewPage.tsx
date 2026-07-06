import React from "react";
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, TrendingUp, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import {
  useDashboard, useDailySeries,
  type DashboardRange, type DailySeriesRow,
} from "../hooks/index.js";
import { formatNaira, formatNairaCompact } from "../lib/money.js";

// ─── Range picker ─────────────────────────────────────────────────────────────

const RANGE_OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "7d",  label: "7 days"  },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All time" },
];

function RangePicker({
  value,
  onChange,
}: {
  value: DashboardRange;
  onChange: (r: DashboardRange) => void;
}) {
  return (
    <div
      className="inline-flex"
      style={{ border: "1px solid var(--border)", background: "var(--bg-surface)" }}
      role="group"
      aria-label="Time range"
    >
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
          style={{
            background:  value === opt.value ? "rgba(22,169,123,0.15)" : "transparent",
            color:       value === opt.value ? "#16A97B"               : "var(--text-muted)",
            borderRight: opt.value !== "all"  ? "1px solid var(--border)" : "none",
          }}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:    string;
  value:    string | number;
  sub?:     string;
  color?:   "green" | "amber" | "red" | "purple" | "default";
  loading?: boolean;
  icon?:    React.ReactNode;
}

const COLOR_MAP = {
  green:   "#22c55e",
  amber:   "#f59e0b",
  red:     "#ef4444",
  purple:  "#a855f7",
  default: "var(--text-primary)",
};

function StatCard({ label, value, sub, color = "default", loading, icon }: StatCardProps) {
  return (
    <div
      className="p-5 transition-shadow duration-200 hover:shadow-[0_0_0_1px_rgba(22,169,123,0.3)]"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
        {icon && <div style={{ color: "var(--text-muted)" }}>{icon}</div>}
      </div>
      {loading ? (
        <div className="h-8 w-28 rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
      ) : (
        <p className="text-2xl font-bold tabular-nums" style={{ color: COLOR_MAP[color] }}>{value}</p>
      )}
      {sub && !loading && (
        <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>{sub}</p>
      )}
    </div>
  );
}

// ─── Tooltips ─────────────────────────────────────────────────────────────────

function RevenueTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 text-xs shadow-xl"
         style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
      <p className="font-medium mb-1" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="font-mono">{formatNaira(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

function StatusTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="px-3 py-2 text-xs shadow-xl"
         style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
      <p className="font-medium mb-2" style={{ color: "var(--text-muted)" }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          <span style={{ color: "var(--text-secondary)" }}>{p.name}:</span>
          <span className="font-mono font-medium">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Chart label formatter ────────────────────────────────────────────────────

/** "2026-07-04" → "Jul 4" */
function fmtDate(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-52 flex flex-col items-center justify-center gap-2" style={{ color: "var(--text-muted)" }}>
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
      <p className="text-xs">{message}</p>
    </div>
  );
}

// ─── Revenue area chart ───────────────────────────────────────────────────────

function RevenueChart({ series }: { series: DailySeriesRow[] }) {
  const hasData = series.some((r) => r.total_received_kobo > 0);

  if (!hasData) return <EmptyChart message="No payments received in this period" />;

  const data = series.map((r) => ({
    date:  fmtDate(r.date),
    kobo:  r.total_received_kobo,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="recvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#16A97B" stopOpacity={0.30} />
            <stop offset="100%" stopColor="#16A97B" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
        <YAxis
          tickFormatter={(v: number) => formatNairaCompact(v)}
          tick={{ fontSize: 10, fill: "var(--text-muted)" }}
          axisLine={false} tickLine={false} width={60}
        />
        <Tooltip content={<RevenueTooltip />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
        <Area type="monotone" dataKey="kobo" stroke="#16A97B" strokeWidth={2} fill="url(#recvGrad)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Status bar chart ─────────────────────────────────────────────────────────

function StatusChart({ series }: { series: DailySeriesRow[] }) {
  const hasData = series.some((r) => r.paid + r.pending + r.underpayment + r.overpayment > 0);

  if (!hasData) return <EmptyChart message="No orders in this period" />;

  const data = series.map((r) => ({
    date:         fmtDate(r.date),
    Paid:         r.paid,
    Pending:      r.pending,
    Underpayment: r.underpayment,
    Overpayment:  r.overpayment,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--text-muted)" }} axisLine={false} tickLine={false} width={28} />
        <Tooltip content={<StatusTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend wrapperStyle={{ fontSize: "11px", color: "var(--text-muted)", paddingTop: "12px" }} />
        <Bar dataKey="Paid"         stackId="a" fill="#22c55e" radius={0} />
        <Bar dataKey="Pending"      stackId="a" fill="#f59e0b" radius={0} />
        <Bar dataKey="Underpayment" stackId="a" fill="#ef4444" radius={0} />
        <Bar dataKey="Overpayment"  stackId="a" fill="#a855f7" radius={[2,2,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const [range, setRange] = React.useState<DashboardRange>("7d");
  // daily-series only supports 7d|30d — "all" falls back to 30d for the chart
  const seriesRange = range === "all" ? "30d" : range;

  const { data, isLoading, isError, error, refetch }           = useDashboard(range);
  const { data: seriesData, isLoading: seriesLoading }          = useDailySeries(seriesRange);

  const collectionRate = data && data.total_expected_kobo > 0
    ? Math.round((data.total_received_kobo / data.total_expected_kobo) * 100)
    : 0;

  const rateColor: StatCardProps["color"] =
    collectionRate >= 90 ? "green" : collectionRate >= 50 ? "amber" : "red";

  const rangeLabel = range === "7d" ? "Last 7 days" : range === "30d" ? "Last 30 days" : "All time";

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Overview</h2>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {rangeLabel}{data?.range_start ? ` · from ${data.range_start}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RangePicker value={range} onChange={setRange} />
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            style={{ border: "1px solid var(--border)", color: "var(--text-muted)", background: "var(--bg-surface)" }}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Error banner */}
      {isError && (
        <div
          className="flex items-center gap-3 p-4 text-sm mb-6"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171" }}
        >
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>Failed to load:</strong> {error.message}</span>
          <button onClick={() => void refetch()} className="ml-auto underline text-xs cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Expected"
          value={data ? formatNairaCompact(data.total_expected_kobo) : "—"}
          sub={data ? formatNaira(data.total_expected_kobo) : undefined}
          icon={<TrendingUp className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Total Received"
          value={data ? formatNairaCompact(data.total_received_kobo) : "—"}
          sub={data ? `${collectionRate}% collection rate` : undefined}
          color={rateColor}
          loading={isLoading}
        />
        <StatCard
          label="Open Exceptions"
          value={data?.exceptions_open ?? "—"}
          sub="underpayment · overpayment · unmatched"
          color={data && data.exceptions_open > 0 ? "red" : "default"}
          icon={<AlertTriangle className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Paid"
          value={data?.orders_paid ?? "—"}
          color="green"
          icon={<CheckCircle className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Pending"
          value={data?.orders_pending ?? "—"}
          color="amber"
          icon={<Clock className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Underpayments"
          value={data?.orders_underpayment ?? "—"}
          color={data && data.orders_underpayment > 0 ? "red" : "default"}
          loading={isLoading}
        />
      </div>

      {/* Collection rate bar */}
      {data && data.total_expected_kobo > 0 && (
        <div
          className="p-5 mb-6"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>Collection Rate</p>
            <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {collectionRate}%
            </p>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--border)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(collectionRate, 100)}%`,
                backgroundColor: collectionRate >= 90 ? "#22c55e" : collectionRate >= 50 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span>{formatNaira(data.total_received_kobo)} received</span>
            <span>{formatNaira(data.total_expected_kobo)} expected</span>
          </div>
        </div>
      )}

      {/* Charts — two side by side on md+, stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Revenue over time */}
        <div
          className="p-5"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-semibold mb-5" style={{ color: "var(--text-secondary)" }}>
            Revenue received · {seriesRange === "7d" ? "7 days" : "30 days"}
          </p>
          {seriesLoading ? (
            <div className="h-52 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-slate-700 border-t-[#16A97B] rounded-full animate-spin" />
            </div>
          ) : seriesData ? (
            <RevenueChart series={seriesData.series} />
          ) : (
            <EmptyChart message="No data" />
          )}
        </div>

        {/* Orders by status over time */}
        <div
          className="p-5"
          style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          <p className="text-sm font-semibold mb-5" style={{ color: "var(--text-secondary)" }}>
            Orders by status · {seriesRange === "7d" ? "7 days" : "30 days"}
          </p>
          {seriesLoading ? (
            <div className="h-52 flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-slate-700 border-t-[#16A97B] rounded-full animate-spin" />
            </div>
          ) : seriesData ? (
            <StatusChart series={seriesData.series} />
          ) : (
            <EmptyChart message="No data" />
          )}
        </div>

      </div>
    </div>
  );
}
