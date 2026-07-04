import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw, TrendingUp, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { useDashboard, type DashboardOverview } from "../hooks/index.js";
import { formatNaira, formatNairaCompact } from "../lib/money.js";

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:    string;
  value:    string | number;
  sub?:     string | undefined;
  color?:   "green" | "amber" | "red" | "purple" | "default";
  loading?: boolean;
  icon?:    React.ReactNode;
}

const COLOR_MAP = {
  green:   "text-green-400",
  amber:   "text-amber-400",
  red:     "text-red-400",
  purple:  "text-purple-400",
  default: "text-slate-50",
};

function StatCard({ label, value, sub, color = "default", loading, icon }: StatCardProps) {
  return (
    <div className="stat-card-accent transition-shadow duration-200 hover:shadow-[0_0_0_1px_rgba(22,169,123,0.3)]">
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{label}</p>
        {icon && <div className="text-slate-600">{icon}</div>}
      </div>
      {loading ? (
        <div className="h-8 w-28 skeleton rounded" />
      ) : (
        <p className={`text-3xl font-bold tabular-nums ${COLOR_MAP[color]}`}>{value}</p>
      )}
      {sub && !loading && (
        <p className="text-xs text-slate-600 mt-1.5">{sub}</p>
      )}
    </div>
  );
}

// ─── Chart data ───────────────────────────────────────────────────────────────

function buildChartData(overview: DashboardOverview) {
  return [
    { name: "Paid",         count: overview.orders_paid,         fill: "#22c55e" },
    { name: "Pending",      count: overview.orders_pending,      fill: "#f59e0b" },
    { name: "Underpayment", count: overview.orders_underpayment, fill: "#ef4444" },
    { name: "Overpayment",  count: overview.orders_overpayment,  fill: "#a855f7" },
  ];
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function DarkTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: Array<{ value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-xl px-4 py-3 shadow-xl text-sm"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <p className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{label}</p>
      <p style={{ color: "var(--text-secondary)" }}>
        <span className="font-mono" style={{ color: "var(--text-primary)" }}>{payload[0]?.value}</span>
        {" "}order{payload[0]?.value !== 1 ? "s" : ""}
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const { data, isLoading, isError, error, refetch } = useDashboard();

  const chartData = data ? buildChartData(data) : [];

  const collectionRate = data && data.total_expected_today_kobo > 0
    ? Math.round((data.total_received_today_kobo / data.total_expected_today_kobo) * 100)
    : 0;

  const rateColor = collectionRate >= 90 ? "green" : collectionRate >= 50 ? "amber" : "red";

  return (
    <div className="p-8 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">Overview</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {data ? `All orders · as of ${data.date}` : "Loading…"}
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

      {/* Error */}
      {isError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 mb-6 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span><strong>Failed to load:</strong> {error.message}</span>
          <button onClick={() => void refetch()} className="ml-auto underline">Retry</button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <StatCard
          label="Total Expected"
          value={data ? formatNairaCompact(data.total_expected_today_kobo) : "—"}
          sub={data ? formatNaira(data.total_expected_today_kobo) : undefined}
          icon={<TrendingUp className="w-4 h-4" />}
          loading={isLoading}
        />
        <StatCard
          label="Total Received"
          value={data ? formatNairaCompact(data.total_received_today_kobo) : "—"}
          sub={data ? `${collectionRate}% collected` : undefined}
          color={rateColor}
          loading={isLoading}
        />
        <StatCard
          label="Open Exceptions"
          value={data?.exceptions_open ?? "—"}
          sub="under · over · unmatched"
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
      {data && data.total_expected_today_kobo > 0 && (
        <div className="card-dark p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-slate-300">Collection Rate</p>
            <p className="text-sm font-bold text-slate-50 tabular-nums">{collectionRate}%</p>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(collectionRate, 100)}%`,
                backgroundColor: collectionRate >= 90 ? "#22c55e" : collectionRate >= 50 ? "#f59e0b" : "#ef4444",
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-slate-600">
            <span>{formatNaira(data.total_received_today_kobo)} received</span>
            <span>{formatNaira(data.total_expected_today_kobo)} expected</span>
          </div>
        </div>
      )}

      {/* Orders by status chart */}
      <div className="card-dark p-6">
        <h3 className="text-sm font-semibold text-slate-300 mb-5">Orders by Status</h3>

        {isLoading && (
          <div className="h-52 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-slate-700 border-t-green-500 rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && chartData.every((d) => d.count === 0) && (
          <div className="h-52 flex flex-col items-center justify-center gap-3 text-slate-600">
            <BarChart3Icon />
            <p className="text-sm">No orders yet today</p>
          </div>
        )}

        {!isLoading && chartData.some((d) => d.count > 0) && (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#475569" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "#475569" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<DarkTooltip />} cursor={{ stroke: "#1E293B", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#greenGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

// tiny inline icon for empty state
function BarChart3Icon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}
