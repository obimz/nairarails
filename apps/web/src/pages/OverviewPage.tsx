import React from "react";
import { useLocation } from "react-router-dom";
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import {
  RefreshCw, TrendingUp, Clock, AlertTriangle,
  CheckCircle, TrendingDown, Layers, Copy, Check, Key, X,
  Ticket, MessageCircle,
} from "lucide-react";
import {
  useDashboard, useDailySeries,
  type DashboardRange, type DailySeriesRow,
} from "../hooks/index.js";
import { formatNaira, formatNairaCompact } from "../lib/money.js";
import { useToast } from "../contexts/ToastContext.js";
import { apiFetch } from "../lib/apiFetch.js";

// ─── Range picker ─────────────────────────────────────────────────────────────

const RANGE_OPTIONS: { value: DashboardRange; label: string }[] = [
  { value: "7d",  label: "7d"       },
  { value: "30d", label: "30d"      },
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
      className="inline-flex rounded-lg overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.10)",
      }}
      role="group"
      aria-label="Time range"
    >
      {RANGE_OPTIONS.map((opt, i) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className="px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A97B]"
          style={{
            background:  value === opt.value
              ? "linear-gradient(135deg, rgba(22,169,123,0.25) 0%, rgba(22,169,123,0.12) 100%)"
              : "transparent",
            color:       value === opt.value ? "#16A97B" : "var(--text-muted)",
            borderRight: i < RANGE_OPTIONS.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
            textShadow:  value === opt.value ? "0 0 12px rgba(22,169,123,0.6)" : "none",
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
  label:     string;
  value:     string | number;
  sub?:      string | undefined;
  trend?:    "up" | "down" | "neutral";
  accent?:   string;   // CSS color for the glow + top bar
  loading?:  boolean;
  icon?:     React.ReactNode;
  iconBg?:   string;
}

function StatCard({ label, value, sub, trend, accent = "#16A97B", loading, icon, iconBg }: StatCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 cursor-default group"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
        border:     "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow:  "0 4px 24px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {/* Accent top bar */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px] transition-opacity duration-300"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          opacity: 0.6,
        }}
      />
      {/* Ambient glow on hover — via group hover using inline style trick */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-2xl"
        style={{ boxShadow: `inset 0 0 40px ${accent}0D` }}
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between mb-4">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}
          >
            {label}
          </p>
          {icon && (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: iconBg ?? `${accent}1A`, border: `1px solid ${accent}30` }}
            >
              <span style={{ color: accent }}>{icon}</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="space-y-2">
            <div className="h-8 w-32 rounded-lg animate-pulse" style={{ background: "rgba(255,255,255,0.07)" }} />
            <div className="h-3 w-20 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
          </div>
        ) : (
          <>
            <p
              className="text-2xl font-bold tabular-nums tracking-tight mb-1"
              style={{ color: "var(--text-primary)" }}
            >
              {value}
            </p>
            {sub && (
              <div className="flex items-center gap-1.5">
                {trend === "up"   && <TrendingUp   className="w-3 h-3 text-green-400" />}
                {trend === "down" && <TrendingDown className="w-3 h-3 text-red-400" />}
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Chart panel wrapper ──────────────────────────────────────────────────────

function ChartPanel({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-5 overflow-hidden"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        border:     "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow:  "0 4px 24px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div className="mb-5">
        <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>{title}</p>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Collection rate bar ──────────────────────────────────────────────────────

function CollectionBar({ rate, received, expected }: {
  rate: number;
  received: number;
  expected: number;
}) {
  const color = rate >= 90 ? "#22c55e" : rate >= 50 ? "#f59e0b" : "#ef4444";
  const glow  = rate >= 90
    ? "0 0 12px rgba(34,197,94,0.5)"
    : rate >= 50
    ? "0 0 12px rgba(245,158,11,0.5)"
    : "0 0 12px rgba(239,68,68,0.5)";

  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        border:     "1px solid rgba(255,255,255,0.09)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow:  "0 4px 24px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4" style={{ color }} />
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
            Collection Rate
          </p>
        </div>
        <p
          className="text-xl font-bold tabular-nums"
          style={{ color, textShadow: glow }}
        >
          {rate}%
        </p>
      </div>

      {/* Track */}
      <div
        className="h-2 rounded-full overflow-hidden mb-3"
        style={{ background: "rgba(255,255,255,0.08)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${Math.min(rate, 100)}%`,
            background: `linear-gradient(90deg, ${color}80, ${color})`,
            boxShadow: glow,
          }}
        />
      </div>

      <div className="flex justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <span className="font-mono">{formatNaira(received)} received</span>
        <span className="font-mono">{formatNaira(expected)} expected</span>
      </div>
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
    <div
      className="px-3 py-2.5 text-xs rounded-xl shadow-2xl"
      style={{
        background: "rgba(15,23,42,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(16px)",
        color: "var(--text-primary)",
      }}
    >
      <p className="mb-1.5 font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="font-mono font-semibold text-[#16A97B]">{formatNaira(payload[0]?.value ?? 0)}</p>
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
    <div
      className="px-3 py-2.5 text-xs rounded-xl shadow-2xl"
      style={{
        background: "rgba(15,23,42,0.92)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: "blur(16px)",
        color: "var(--text-primary)",
      }}
    >
      <p className="mb-2 font-medium" style={{ color: "var(--text-muted)" }}>{label}</p>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ background: p.color }} />
          <span style={{ color: "var(--text-muted)" }}>{p.name}:</span>
          <span className="font-mono font-semibold ml-auto pl-4">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Chart formatters ─────────────────────────────────────────────────────────

function fmtAxisDate(iso: string, range: "7d" | "30d") {
  const d = new Date(iso + "T00:00:00Z");
  if (range === "7d") {
    return d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  }
  return d.toLocaleDateString("en-GB", { month: "short", day: "numeric", timeZone: "UTC" });
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyChart({ message }: { message: string }) {
  return (
    <div
      className="h-52 flex flex-col items-center justify-center gap-3 rounded-xl"
      style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed rgba(255,255,255,0.08)",
        color: "var(--text-muted)",
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="6"  y1="20" x2="6"  y2="14"/>
      </svg>
      <p className="text-xs">{message}</p>
    </div>
  );
}

// ─── Revenue chart ────────────────────────────────────────────────────────────

function RevenueChart({ series, seriesRange }: { series: DailySeriesRow[]; seriesRange: "7d" | "30d" }) {
  const hasData = series.some((r) => r.total_received_kobo > 0);
  if (!hasData) return <EmptyChart message="No payments received in this period" />;

  const data = series.map((r) => ({ date: fmtAxisDate(r.date, seriesRange), kobo: r.total_received_kobo }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="recvGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#16A97B" stopOpacity={0.35} />
            <stop offset="75%"  stopColor="#16A97B" stopOpacity={0.05} />
            <stop offset="100%" stopColor="#16A97B" stopOpacity={0.00} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }}
          axisLine={false} tickLine={false}
          interval={seriesRange === "30d" ? 4 : 0}
        />
        <YAxis
          tickFormatter={(v: number) => formatNairaCompact(v)}
          tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }}
          axisLine={false} tickLine={false} width={64}
        />
        <Tooltip content={<RevenueTooltip />} cursor={{ stroke: "rgba(22,169,123,0.3)", strokeWidth: 1 }} />
        <Area
          type="monotone" dataKey="kobo"
          stroke="#16A97B" strokeWidth={2}
          fill="url(#recvGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "#16A97B", stroke: "#0A0E14", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Status bar chart ─────────────────────────────────────────────────────────

function StatusChart({ series, seriesRange }: { series: DailySeriesRow[]; seriesRange: "7d" | "30d" }) {
  const hasData = series.some((r) => r.paid + r.pending + r.underpayment + r.overpayment > 0);
  if (!hasData) return <EmptyChart message="No orders in this period" />;

  const data = series.map((r) => ({
    date:         fmtAxisDate(r.date, seriesRange),
    Paid:         r.paid,
    Pending:      r.pending,
    Underpayment: r.underpayment,
    Overpayment:  r.overpayment,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }}
          axisLine={false} tickLine={false}
          interval={seriesRange === "30d" ? 4 : 0}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: "var(--text-muted)", fontFamily: "inherit" }}
          axisLine={false} tickLine={false} width={28}
        />
        <Tooltip content={<StatusTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Legend
          wrapperStyle={{ fontSize: "11px", paddingTop: "14px" }}
          formatter={(val) => (
            <span style={{ color: "var(--text-muted)" }}>{val}</span>
          )}
        />
        <Bar dataKey="Paid"         stackId="s" fill="#22c55e" radius={0} />
        <Bar dataKey="Pending"      stackId="s" fill="#f59e0b" radius={0} />
        <Bar dataKey="Underpayment" stackId="s" fill="#ef4444" radius={0} />
        <Bar dataKey="Overpayment"  stackId="s" fill="#a855f7" radius={[3,3,0,0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Chart loading skeleton ───────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="h-52 flex items-end gap-1.5 px-2 pb-2">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm animate-pulse"
          style={{
            height: `${25 + Math.random() * 60}%`,
            background: "rgba(255,255,255,0.06)",
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
    </div>
  );
}

// ─── ApiKeyModal ──────────────────────────────────────────────────────────────
// Shown once when a merchant lands on the dashboard after email verification.
// The raw API key is passed via React Router location.state.newApiKey — it
// is never fetched again. Dismissing the modal clears it from state.

function ApiKeyModal({ apiKey, onClose }: { apiKey: string; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);

  function copy() {
    void navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl shadow-2xl"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        {/* Top accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
          style={{ background: "linear-gradient(90deg, transparent, #16A97B, transparent)" }}
        />

        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(22,169,123,0.12)", border: "1px solid rgba(22,169,123,0.25)" }}
              >
                <Key className="w-5 h-5" style={{ color: "#16A97B" }} />
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Your API Key</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Copy it now — it won't be shown again
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg transition-opacity hover:opacity-70 cursor-pointer"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Warning */}
          <div
            className="flex items-start gap-2.5 rounded-xl px-3 py-2.5 mb-4 text-xs"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b" }}
          >
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Store this in your environment variables. We hash it immediately and cannot recover it.</span>
          </div>

          {/* Key display */}
          <div
            className="flex items-center gap-2 rounded-xl px-4 py-3 mb-4"
            style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}
          >
            <code
              className="flex-1 text-xs font-mono break-all select-all"
              style={{ color: "#16A97B" }}
            >
              {apiKey}
            </code>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer"
              style={{
                background:  copied ? "rgba(22,169,123,0.20)" : "rgba(22,169,123,0.12)",
                border:      "1px solid rgba(22,169,123,0.30)",
                color:       "#16A97B",
              }}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Dismiss */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
          >
            I've saved my key — continue to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Support tickets widget ───────────────────────────────────────────────────

interface SupportTicket {
  id:         number;
  summary:    string;
  status:     "open" | "resolved";
  resolution: string | null;
  created_at: string;
}

function SupportTicketsWidget() {
  const [tickets, setTickets] = React.useState<SupportTicket[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ tickets: SupportTicket[] }>("/api/v1/support/tickets");
      setTickets(res.tickets);
    } catch {
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => { void load(); }, []);

  // Don't render the widget at all if there are no tickets
  if (!loading && (!tickets || tickets.length === 0)) return null;

  const open     = tickets?.filter((t) => t.status === "open").length ?? 0;
  const resolved = tickets?.filter((t) => t.status === "resolved").length ?? 0;

  return (
    <div
      className="mt-4 rounded-2xl p-5"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
        border: open > 0 ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(255,255,255,0.09)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.06)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: open > 0 ? "rgba(245,158,11,0.12)" : "rgba(22,169,123,0.10)",
              border: open > 0 ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(22,169,123,0.20)",
            }}
          >
            <Ticket className="w-4 h-4" style={{ color: open > 0 ? "#f59e0b" : "#16A97B" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Support Tickets
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {loading ? "Loading…" : `${open} open · ${resolved} resolved`}
            </p>
          </div>
        </div>
        {/* Hint to open chat */}
        <div
          className="flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1.5 rounded-lg"
          style={{ background: "rgba(22,169,123,0.08)", border: "1px solid rgba(22,169,123,0.15)", color: "#16A97B" }}
        >
          <MessageCircle className="w-3 h-3" />
          Open chat widget to reply
        </div>
      </div>

      {/* Ticket rows */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 rounded-xl animate-pulse"
                 style={{ background: "rgba(255,255,255,0.04)" }} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {(tickets ?? []).slice(0, 5).map((t) => (
            <div
              key={t.id}
              className="flex items-start justify-between gap-3 rounded-xl px-3.5 py-3"
              style={{
                background: t.status === "open"
                  ? "rgba(245,158,11,0.05)"
                  : "rgba(255,255,255,0.03)",
                border: t.status === "open"
                  ? "1px solid rgba(245,158,11,0.15)"
                  : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs leading-relaxed truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {t.summary}
                </p>
                {t.resolution && (
                  <p className="text-[10px] mt-0.5 truncate" style={{ color: "#16A97B" }}>
                    Reply: {t.resolution}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                  style={{
                    background: t.status === "open" ? "rgba(245,158,11,0.15)" : "rgba(22,169,123,0.12)",
                    color: t.status === "open" ? "#f59e0b" : "#16A97B",
                  }}
                >
                  {t.status === "open" ? "Open" : "Resolved"}
                </span>
                <span
                  className="text-[10px] flex items-center gap-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Clock className="w-2.5 h-2.5" />
                  {new Date(t.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short" })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OverviewPage() {
  const location = useLocation();
  const [range, setRange] = React.useState<DashboardRange>("7d");
  const seriesRange: "7d" | "30d" = range === "all" ? "30d" : range;

  // Pick up the raw API key passed via route state from AuthCallbackPage.
  // Replace the state immediately so a manual refresh doesn't re-show the modal.
  const [newApiKey, setNewApiKey] = React.useState<string | null>(() => {
    const state = location.state as { newApiKey?: string } | null;
    return state?.newApiKey ?? null;
  });

  React.useEffect(() => {
    if (newApiKey) {
      // Clear the state from the history entry so a back/forward nav won't re-show it.
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [newApiKey]);
  const toast = useToast();

  const { data, isLoading, isError, error, refetch }  = useDashboard(range);
  const { data: seriesData, isLoading: seriesLoading } = useDailySeries(seriesRange);

  // Fire a toast whenever the dashboard query errors
  React.useEffect(() => {
    if (isError) {
      toast.error(error.message, "Dashboard unavailable");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isError, error?.message]);

  const collectionRate = data && data.total_expected_kobo > 0
    ? Math.round((data.total_received_kobo / data.total_expected_kobo) * 100)
    : 0;

  const rangeLabel =
    range === "7d"  ? "Last 7 days" :
    range === "30d" ? "Last 30 days" : "All time";

  return (
    <div
      className="min-h-screen p-6 md:p-8"
      style={{ background: "var(--bg-base)" }}
    >
      {/* API key reveal modal — shown once after email verification */}
      {newApiKey && (
        <ApiKeyModal apiKey={newApiKey} onClose={() => setNewApiKey(null)} />
      )}

      {/* Ambient background glow — purely decorative */}
      <div
        className="pointer-events-none fixed top-0 right-0 w-[600px] h-[400px] opacity-[0.04] blur-[120px]"
        style={{ background: "radial-gradient(ellipse, #16A97B 0%, transparent 70%)" }}
        aria-hidden
      />

      <div className="relative z-10 max-w-6xl mx-auto">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
              Overview
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              {rangeLabel}
              {data?.range_start && range !== "all"
                ? <span className="ml-1 font-mono text-xs">· from {data.range_start}</span>
                : null}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <RangePicker value={range} onChange={setRange} />
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A97B]"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.10)",
                color: "var(--text-muted)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.09)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Stat cards grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
          <StatCard
            label="Total Expected"
            value={data ? formatNairaCompact(data.total_expected_kobo) : "—"}
            sub={data ? formatNaira(data.total_expected_kobo) : undefined}
            icon={<TrendingUp className="w-4 h-4" />}
            accent="#16A97B"
            loading={isLoading}
          />
          <StatCard
            label="Total Received"
            value={data ? formatNairaCompact(data.total_received_kobo) : "—"}
            sub={data ? `${collectionRate}% collection rate` : undefined}
            trend={collectionRate >= 90 ? "up" : collectionRate < 50 ? "down" : "neutral"}
            accent={collectionRate >= 90 ? "#22c55e" : collectionRate >= 50 ? "#f59e0b" : "#ef4444"}
            icon={<TrendingUp className="w-4 h-4" />}
            loading={isLoading}
          />
          <StatCard
            label="Open Exceptions"
            value={data?.exceptions_open ?? "—"}
            sub="need attention"
            accent={data && data.exceptions_open > 0 ? "#ef4444" : "#64748b"}
            icon={<AlertTriangle className="w-4 h-4" />}
            loading={isLoading}
          />
          <StatCard
            label="Paid"
            value={data?.orders_paid ?? "—"}
            sub={rangeLabel.toLowerCase()}
            accent="#22c55e"
            icon={<CheckCircle className="w-4 h-4" />}
            loading={isLoading}
          />
          <StatCard
            label="Pending"
            value={data?.orders_pending ?? "—"}
            sub="awaiting payment"
            accent="#f59e0b"
            icon={<Clock className="w-4 h-4" />}
            loading={isLoading}
          />
          <StatCard
            label="Underpayments"
            value={data?.orders_underpayment ?? "—"}
            sub="shortfall held"
            accent={data && data.orders_underpayment > 0 ? "#ef4444" : "#64748b"}
            icon={<TrendingDown className="w-4 h-4" />}
            loading={isLoading}
          />
        </div>

        {/* ── Collection rate bar ──────────────────────────────────────────── */}
        {(data && data.total_expected_kobo > 0) && (
          <div className="mb-4">
            <CollectionBar
              rate={collectionRate}
              received={data.total_received_kobo}
              expected={data.total_expected_kobo}
            />
          </div>
        )}

        {/* ── Charts ───────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartPanel
            title="Revenue received"
            subtitle={seriesRange === "7d" ? "Last 7 days · daily" : "Last 30 days · daily"}
          >
            {seriesLoading
              ? <ChartSkeleton />
              : seriesData
              ? <RevenueChart series={seriesData.series} seriesRange={seriesRange} />
              : <EmptyChart message="No data" />}
          </ChartPanel>

          <ChartPanel
            title="Orders by status"
            subtitle={seriesRange === "7d" ? "Last 7 days · stacked" : "Last 30 days · stacked"}
          >
            {seriesLoading
              ? <ChartSkeleton />
              : seriesData
              ? <StatusChart series={seriesData.series} seriesRange={seriesRange} />
              : <EmptyChart message="No data" />}
          </ChartPanel>
        </div>

        {/* ── Support tickets widget ── */}
        <SupportTicketsWidget />

      </div>
    </div>
  );
}
