/**
 * OverviewPage — dashboard home with stat cards and a payment-status bar chart.
 *
 * Data comes from GET /api/v1/dashboard/overview via useDashboard().
 * Recharts BarChart shows the order count breakdown by status.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useDashboard, type DashboardOverview } from "../hooks/index.js";
import { formatNaira, formatNairaCompact } from "../lib/money.js";

// ─── Stat card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  label:       string;
  value:       string | number;
  sub?:        string | undefined;
  accent?:     string | undefined;
  loading?:    boolean | undefined;
}

function StatCard({ label, value, sub, accent = "text-gray-900", loading }: StatCardProps) {
  return (
    <div className="stat-card">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {loading ? (
        <div className="h-7 w-24 bg-gray-200 animate-pulse rounded" />
      ) : (
        <p className={`text-2xl font-bold ${accent} tabular-nums`}>{value}</p>
      )}
      {sub && !loading && (
        <p className="text-xs text-gray-400 mt-1">{sub}</p>
      )}
    </div>
  );
}

// ─── Chart data builder ───────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  Paid:         "#16a34a",
  Pending:      "#ca8a04",
  Underpayment: "#dc2626",
  Overpayment:  "#9333ea",
};

function buildChartData(overview: DashboardOverview) {
  return [
    { name: "Paid",         count: overview.orders_paid },
    { name: "Pending",      count: overview.orders_pending },
    { name: "Underpayment", count: overview.orders_underpayment },
    { name: "Overpayment",  count: overview.orders_overpayment },
  ].filter((d) => d.count > 0); // hide zero-count bars so chart isn't mostly empty
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

interface TooltipPayloadItem {
  name:  string;
  value: number;
  color: string;
}

interface TooltipProps {
  active?:  boolean;
  payload?: TooltipPayloadItem[];
  label?:   string;
}

function ChartTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  if (!item) return null;
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm text-sm">
      <p className="font-medium" style={{ color: item.color }}>{label}</p>
      <p className="text-gray-700">{item.value} order{item.value !== 1 ? "s" : ""}</p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const { data, isLoading, isError, error, refetch } = useDashboard();

  const collection = data ? buildChartData(data) : [];
  const hasChartData = collection.length > 0;

  const collectionRate = data && data.total_expected_today_kobo > 0
    ? Math.round((data.total_received_today_kobo / data.total_expected_today_kobo) * 100)
    : 0;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="section-title text-xl">Overview</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {data ? `Today — ${data.date}` : "Loading…"}
          </p>
        </div>
        <button onClick={() => void refetch()} className="btn-ghost text-xs">
          ↻ Refresh
        </button>
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700 mb-6">
          <strong>Failed to load overview:</strong> {error.message}
          <button onClick={() => void refetch()} className="ml-4 underline">Retry</button>
        </div>
      )}

      {/* Stat cards — 2×3 grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <StatCard
          label="Expected Today"
          value={data ? formatNairaCompact(data.total_expected_today_kobo) : "—"}
          sub={data ? formatNaira(data.total_expected_today_kobo) : undefined}
          loading={isLoading}
        />
        <StatCard
          label="Received Today"
          value={data ? formatNairaCompact(data.total_received_today_kobo) : "—"}
          sub={data ? `${collectionRate}% collected` : undefined}
          accent={collectionRate >= 90 ? "text-green-600" : collectionRate >= 50 ? "text-yellow-600" : "text-red-600"}
          loading={isLoading}
        />
        <StatCard
          label="Open Exceptions"
          value={data?.exceptions_open ?? "—"}
          sub="underpayment + overpayment + unmatched"
          accent={data && data.exceptions_open > 0 ? "text-red-600" : "text-gray-900"}
          loading={isLoading}
        />
        <StatCard
          label="Paid"
          value={data?.orders_paid ?? "—"}
          accent="text-green-600"
          loading={isLoading}
        />
        <StatCard
          label="Pending"
          value={data?.orders_pending ?? "—"}
          accent="text-yellow-600"
          loading={isLoading}
        />
        <StatCard
          label="Underpayments"
          value={data?.orders_underpayment ?? "—"}
          accent={data && data.orders_underpayment > 0 ? "text-red-600" : "text-gray-900"}
          loading={isLoading}
        />
      </div>

      {/* Bar chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Orders by Status</h3>

        {isLoading && (
          <div className="h-48 flex items-center justify-center">
            <span className="animate-spin inline-block w-5 h-5 border-2 border-gray-300 border-t-green-500 rounded-full" />
          </div>
        )}

        {!isLoading && !hasChartData && (
          <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
            No orders yet today.
          </div>
        )}

        {!isLoading && hasChartData && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={collection} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: "#6b7280" }}
                axisLine={false}
                tickLine={false}
                width={28}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "#f9fafb" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {collection.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={STATUS_COLOURS[entry.name] ?? "#6b7280"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Collection rate progress bar */}
      {data && data.total_expected_today_kobo > 0 && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Collection Rate</p>
            <p className="text-sm font-bold text-gray-900">{collectionRate}%</p>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(collectionRate, 100)}%`,
                backgroundColor: collectionRate >= 90 ? "#16a34a" : collectionRate >= 50 ? "#ca8a04" : "#dc2626",
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5 text-xs text-gray-400">
            <span>{formatNaira(data.total_received_today_kobo)} received</span>
            <span>{formatNaira(data.total_expected_today_kobo)} expected</span>
          </div>
        </div>
      )}
    </div>
  );
}
