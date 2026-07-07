/**
 * AdminPage — internal ops panel.
 *
 * Gated by ADMIN_SECRET (x-admin-secret header). The secret is held only in
 * component state for the session — never written to localStorage or the DOM.
 *
 * Sections (sidebar nav):
 *   Overview     — system-wide stats at a glance
 *   Merchants    — all merchants + per-merchant order stats
 *   Orders       — cross-merchant order list with filters
 *   Reconcile    — diff Nomba transactions vs local ledger
 *   Tools        — bank lookup, expire pending, reset order
 *   Danger       — nuke
 */

import React from "react";
import { LogoMark } from "../components/Logo.js";
import {
  LayoutDashboard, Users, Receipt, GitCompare, Wrench, Trash2,
  LogOut, Search, Clock, RotateCcw, AlertTriangle, CheckCircle2,
  Eye, EyeOff, RefreshCw, ChevronRight, Shield, TrendingUp,
  XCircle, Copy, Check, ExternalLink,
  Ban, UserCheck, KeyRound, Edit3, X, Webhook, Activity,
  ChevronDown, ChevronUp, ChevronsRight, BookOpen, Terminal,
  ServerCrash, Database, Cpu, Menu, MessageCircle, Ticket,
} from "lucide-react";
import { adminFetch } from "../lib/apiFetch.js";
import { formatNaira } from "../lib/money.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PanelResult { ok: boolean; data: unknown; }

interface AdminOrderDetail {
  order_ref: string; customer_name: string; customer_email: string | null;
  expected_amount_kobo: number; received_amount_kobo: number | null;
  status: string; virtual_account_number: string | null;
  bank_name: string | null; bank_code: string | null;
  sender_name: string | null; sender_account_number: string | null;
  sender_bank_code: string | null; currency: string;
  created_at: string; updated_at: string;
  merchant: { id: string; name: string; email: string };
  splits: Array<{
    party: string; account_number: string; bank_code: string;
    percentage: number; amount_kobo: number | null;
    status: string; nomba_transfer_ref: string | null; created_at: string;
  }>;
  ledger_entries: Array<{
    id: number; entry_type: string; amount_kobo: number;
    currency: string; reference: string | null;
    narration: string | null; created_at: string;
  }>;
  webhook_events: Array<{
    id: number; request_id: string; event_type: string;
    processed_at: string | null; created_at: string;
    raw_payload: unknown;
  }>;
}

interface WebhookEvent {
  id: number; request_id: string; event_type: string;
  processed_at: string | null; created_at: string;
  raw_payload: unknown;
}

interface SystemHealth {
  status: "healthy" | "degraded";
  timestamp: string; uptime_seconds: number;
  env: { vars: Record<string, boolean>; missing_count: number; all_present: boolean };
  database: { connected: boolean; latency_ms: number | null; total_orders: number | null; total_merchants: number | null };
  process: { node_version: string; platform: string; env: string; memory_mb: number };
}

interface AdminOrder {
  order_ref: string; customer_name: string;
  expected_amount_kobo: number; received_amount_kobo: number | null;
  status: string; virtual_account_number: string;
  created_at: string; merchant_id: string;
  merchant_name: string; merchant_email: string;
}

interface AdminMerchant {
  id: string; name: string; email: string;
  email_verified: boolean; webhook_url: string | null;
  api_key_prefix: string | null; api_key_issued_at: string | null;
  api_key_expires_at: string | null; created_at: string;
  total_orders: number; orders_paid: number;
  orders_pending: number; orders_exception: number;
  suspended: boolean; suspended_at: string | null; suspended_note: string | null;
}

interface ReconcileResult {
  checked_at: string; date_from: string; date_to: string;
  total_checked: number; matched: number;
  orphans: Array<{ transactionId: string; merchantTxRef: string; amount_kobo: number; created_at: string }>;
  drift:   Array<{ transactionId: string; merchantTxRef: string; nomba_amount_kobo: number; local_amount_kobo: number; order_ref: string }>;
  summary?: string;
}

type NavSection = "overview" | "merchants" | "orders" | "reconcile" | "tools" | "webhooks" | "health" | "support" | "danger";

// ─── Shared primitives ────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  paid:         { bg: "rgba(34,197,94,0.12)",   color: "#22c55e", label: "Paid" },
  pending:      { bg: "rgba(245,158,11,0.12)",  color: "#f59e0b", label: "Pending" },
  underpayment: { bg: "rgba(239,68,68,0.12)",   color: "#ef4444", label: "Underpayment" },
  overpayment:  { bg: "rgba(168,85,247,0.12)",  color: "#a855f7", label: "Overpayment" },
  unmatched:    { bg: "rgba(100,116,139,0.12)", color: "#94a3b8", label: "Unmatched" },
  expired:      { bg: "rgba(100,116,139,0.10)", color: "#64748b", label: "Expired" },
  refunded:     { bg: "rgba(22,169,123,0.10)",  color: "#16A97B", label: "Refunded" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? { bg: "rgba(100,116,139,0.1)", color: "#94a3b8", label: status };
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
          style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

function ResultBox({ result }: { result: PanelResult | null }) {
  if (!result) return null;
  return (
    <div
      className="mt-4 rounded-xl p-4 text-xs font-mono whitespace-pre-wrap break-all"
      style={{
        background: result.ok
          ? "linear-gradient(135deg, rgba(22,169,123,0.08) 0%, rgba(22,169,123,0.04) 100%)"
          : "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.04) 100%)",
        border: `1px solid ${result.ok ? "rgba(22,169,123,0.25)" : "rgba(239,68,68,0.25)"}`,
        boxShadow: `inset 0 1px 0 ${result.ok ? "rgba(22,169,123,0.08)" : "rgba(239,68,68,0.08)"}`,
        color: result.ok ? "#86efac" : "#fca5a5",
      }}
    >
      <div
        className="flex items-center gap-1.5 mb-2 font-sans font-semibold text-[11px]"
        style={{ color: result.ok ? "#22c55e" : "#ef4444" }}
      >
        {result.ok
          ? <CheckCircle2 className="w-3.5 h-3.5" />
          : <XCircle className="w-3.5 h-3.5" />}
        {result.ok ? "Success" : "Error"}
      </div>
      {JSON.stringify(result.data, null, 2)}
    </div>
  );
}

function FieldInput({
  label, value, onChange, placeholder, type = "text", mono = true,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-lg px-3 py-2 text-sm outline-none transition-all ${mono ? "font-mono" : ""}`}
        style={{ background: "var(--bg-base)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
        onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
      />
    </label>
  );
}

function ActionBtn({
  children, onClick, loading, danger, disabled, small,
}: {
  children: React.ReactNode; onClick: () => void;
  loading?: boolean | undefined; danger?: boolean | undefined; disabled?: boolean | undefined; small?: boolean | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`inline-flex items-center gap-2 rounded-lg font-semibold transition-all
        disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer
        ${small ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm"}
        ${danger
          ? "bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25"
          : "border hover:opacity-90"}`}
      style={danger ? {} : {
        background:  "rgba(22,169,123,0.12)",
        borderColor: "rgba(22,169,123,0.30)",
        color:       "#16A97B",
      }}
    >
      {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
      {children}
    </button>
  );
}

function SectionHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div className="flex items-start gap-3">
        {/* Left accent bar */}
        <div
          className="w-0.5 h-6 rounded-full mt-0.5 shrink-0"
          style={{ background: "linear-gradient(180deg, #16A97B, rgba(22,169,123,0.2))", boxShadow: "0 0 6px rgba(22,169,123,0.4)" }}
        />
        <div>
          <h2 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string | number; accent?: string | undefined }) {
  return (
    <div
      className="rounded-xl p-4 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* Subtle accent glow in corner */}
      {accent && (
        <div
          className="absolute top-0 right-0 w-16 h-16 opacity-10 blur-2xl pointer-events-none"
          style={{ background: accent }}
          aria-hidden
        />
      )}
      <p
        className="text-[10px] font-semibold uppercase tracking-widest mb-2 relative z-10"
        style={{ color: "rgba(100,116,139,0.8)" }}
      >
        {label}
      </p>
      <p
        className="text-2xl font-bold tabular-nums relative z-10"
        style={{ color: accent ?? "var(--text-primary)" }}
      >
        {value}
      </p>
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button type="button"
      className="p-1 rounded transition-opacity hover:opacity-70 cursor-pointer"
      style={{ color: "var(--text-muted)" }}
      onClick={() => { void navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
      aria-label="Copy">
      {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
    </button>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

function ConfirmModal({
  open, title, message, confirmLabel = "Confirm", danger = false,
  onConfirm, onCancel, loading, extra,
}: {
  open: boolean; title: string; message: string;
  confirmLabel?: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
  loading?: boolean | undefined; extra?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
         style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <div className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
           style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
             style={{ background: `linear-gradient(90deg, transparent, ${danger ? "#ef4444" : "#16A97B"}, transparent)` }} />
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: danger ? "rgba(239,68,68,0.12)" : "rgba(22,169,123,0.12)",
                        border: `1px solid ${danger ? "rgba(239,68,68,0.25)" : "rgba(22,169,123,0.25)"}` }}>
            <AlertTriangle className="w-4 h-4" style={{ color: danger ? "#ef4444" : "#16A97B" }} />
          </div>
          <div>
            <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{title}</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{message}</p>
          </div>
        </div>
        {extra && <div className="mb-4">{extra}</div>}
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onCancel}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={loading}
            className="px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-50 flex items-center gap-2"
            style={{
              background: danger ? "rgba(239,68,68,0.15)" : "rgba(22,169,123,0.15)",
              border: `1px solid ${danger ? "rgba(239,68,68,0.3)" : "rgba(22,169,123,0.3)"}`,
              color: danger ? "#ef4444" : "#16A97B",
            }}>
            {loading && <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function Drawer({ open, onClose, title, subtitle, children }: {
  open: boolean; onClose: () => void;
  title: string; subtitle?: string | undefined;
  children: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
           onClick={onClose} />
      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl flex flex-col shadow-2xl"
           style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4"
             style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{title}</p>
            {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors hover:opacity-70"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-muted)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">{children}</div>
      </div>
    </div>
  );
}


// ─── Login screen ─────────────────────────────────────────────────────────────

function AdminLogin({ onAuth }: { onAuth: (secret: string) => void }) {
  const [input, setInput]     = React.useState("");
  const [show, setShow]       = React.useState(false);
  const [error, setError]     = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function submit() {
    if (!input.trim()) { setError("Enter your admin secret"); return; }
    setLoading(true); setError("");
    try {
      await adminFetch("GET", "/api/v1/admin/banks", input.trim());
      onAuth(input.trim());
    } catch (err: unknown) {
      const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 0;
      if (status === 401) {
        setError("Invalid secret — check ADMIN_SECRET in your .env");
      } else {
        onAuth(input.trim()); // non-401 = secret ok, Nomba/DB issue downstream
      }
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 auth-bg">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 opacity-[0.06] blur-[120px]"
           style={{ background: "radial-gradient(ellipse at 50% 30%, #16A97B, transparent 70%)" }} aria-hidden />

      <div className="relative w-full max-w-sm rounded-2xl p-8 shadow-2xl"
           style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
             style={{ background: "linear-gradient(90deg, transparent, #16A97B, transparent)" }} />

        <div className="flex items-center gap-3 mb-7">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
               style={{ background: "rgba(22,169,123,0.12)", border: "1px solid rgba(22,169,123,0.25)" }}>
            <Shield className="w-5 h-5" style={{ color: "#16A97B" }} />
          </div>
          <div>
            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>NairaRails Admin</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Internal ops panel — restricted access</p>
          </div>
        </div>

        <label className="block mb-1.5">
          <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Admin Secret
          </span>
          <div className="relative">
            <input
              type={show ? "text" : "password"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
              placeholder="••••••••••••••••"
              className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm font-mono outline-none transition-all"
              style={{ background: "var(--input-bg)", border: "1px solid var(--input-border)", color: "var(--text-primary)" }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
              onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--input-border)")}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-opacity hover:opacity-70"
              style={{ color: "var(--text-muted)" }}
              aria-label={show ? "Hide secret" : "Show secret"}
            >
              {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </label>

        {error && (
          <p className="text-xs text-red-400 mb-3 flex items-center gap-1.5 mt-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={loading}
          className="w-full mt-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50
                     flex items-center justify-center gap-2 cursor-pointer"
          style={{ background: "#16A97B", color: "#000",
                   boxShadow: "0 4px 16px rgba(22,169,123,0.3)" }}
        >
          {loading
            ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Verifying…</>
            : <><Shield className="w-4 h-4" /> Unlock Panel</>}
        </button>
      </div>
    </div>
  );
}


// ─── Section: Overview ────────────────────────────────────────────────────────

function OverviewSection({ secret }: { secret: string }) {
  const [orders, setOrders]       = React.useState<AdminOrder[] | null>(null);
  const [merchants, setMerchants] = React.useState<AdminMerchant[] | null>(null);
  const [loading, setLoading]     = React.useState(false);
  const [error, setError]         = React.useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const [oRes, mRes] = await Promise.all([
        adminFetch<{ results: AdminOrder[]; total_count: number }>("GET", "/api/v1/admin/orders?page_size=200", secret),
        adminFetch<{ total: number; merchants: AdminMerchant[] }>("GET", "/api/v1/admin/merchants", secret),
      ]);
      setOrders(oRes.results);
      setMerchants(mRes.merchants);
    } catch (e) {
      setError(String(e));
    } finally { setLoading(false); }
  }

  React.useEffect(() => { void load(); }, []);

  const totalOrders    = orders?.length ?? 0;
  const totalPaid      = orders?.filter((o) => o.status === "paid").length ?? 0;
  const totalException = orders?.filter((o) => ["underpayment","overpayment","unmatched"].includes(o.status)).length ?? 0;
  const totalMerchants = merchants?.length ?? 0;
  const totalRevenue   = orders?.reduce((s, o) => s + (o.received_amount_kobo ?? 0), 0) ?? 0;

  return (
    <div>
      <SectionHeader
        title="System Overview"
        subtitle="Live snapshot across all merchants"
        action={
          <ActionBtn onClick={() => void load()} loading={loading} small>
            <RefreshCw className="w-3 h-3" /> Refresh
          </ActionBtn>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 text-xs text-red-400 p-3 rounded-lg"
             style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <StatTile label="Total Merchants"  value={loading ? "…" : totalMerchants} accent="#16A97B" />
        <StatTile label="Total Orders"     value={loading ? "…" : totalOrders} />
        <StatTile label="Paid Orders"      value={loading ? "…" : totalPaid}      accent="#22c55e" />
        <StatTile label="Open Exceptions"  value={loading ? "…" : totalException} accent={totalException > 0 ? "#ef4444" : undefined} />
        <StatTile label="Total Received"   value={loading ? "…" : formatNaira(totalRevenue)} accent="#16A97B" />
        <StatTile label="Verified Merchants" value={loading ? "…" : (merchants?.filter((m) => m.email_verified).length ?? 0)} />
      </div>

      {/* Recent orders mini-table */}
      {orders && orders.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3"
             style={{ color: "var(--text-muted)" }}>Recent Orders</p>
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Order Ref", "Merchant", "Expected", "Status", "Date"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold uppercase tracking-wide"
                        style={{ color: "var(--text-muted)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 8).map((o) => (
                  <tr key={o.order_ref} style={{ borderTop: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)" }}>
                    <td className="px-3 py-2 font-mono" style={{ color: "var(--text-primary)" }}>{o.order_ref}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-secondary)" }}>{o.merchant_name}</td>
                    <td className="px-3 py-2 font-mono tabular-nums" style={{ color: "var(--text-secondary)" }}>{formatNaira(o.expected_amount_kobo)}</td>
                    <td className="px-3 py-2"><StatusPill status={o.status} /></td>
                    <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                      {new Date(o.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Merchants ───────────────────────────────────────────────────────

function MerchantsSection({ secret }: { secret: string }) {
  const [merchants, setMerchants] = React.useState<AdminMerchant[] | null>(null);
  const [loading, setLoading]     = React.useState(false);
  const [error, setError]         = React.useState("");
  const [search, setSearch]       = React.useState("");
  const [actionLoading, setActionLoading] = React.useState<Record<string, boolean>>({});
  const [actionResults, setActionResults] = React.useState<Record<string, PanelResult>>({});

  // Modals
  const [suspendModal, setSuspendModal] = React.useState<{ id: string; name: string } | null>(null);
  const [suspendNote, setSuspendNote]   = React.useState("");
  const [deleteModal, setDeleteModal]   = React.useState<{ id: string; name: string } | null>(null);
  const [editModal, setEditModal]       = React.useState<AdminMerchant | null>(null);
  const [editName, setEditName]         = React.useState("");
  const [editWebhook, setEditWebhook]   = React.useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await adminFetch<{ total: number; merchants: AdminMerchant[] }>("GET", "/api/v1/admin/merchants", secret);
      setMerchants(res.merchants);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { void load(); }, []);

  const filtered = (merchants ?? []).filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase())
  );

  async function doAction(id: string, endpoint: string, method: "POST" | "DELETE", body?: unknown) {
    setActionLoading((p) => ({ ...p, [id]: true }));
    try {
      const data = await adminFetch(method, endpoint, secret, body);
      setActionResults((p) => ({ ...p, [id]: { ok: true, data } }));
      await load();
    } catch (e) {
      setActionResults((p) => ({ ...p, [id]: { ok: false, data: String(e) } }));
    } finally {
      setActionLoading((p) => ({ ...p, [id]: false }));
    }
  }

  return (
    <div>
      <ConfirmModal
        open={!!suspendModal}
        title={`Suspend ${suspendModal?.name ?? "merchant"}?`}
        message="Their API key will immediately return 403 until reactivated."
        confirmLabel="Suspend Merchant"
        danger
        loading={!!suspendModal && actionLoading[suspendModal.id]}
        onCancel={() => { setSuspendModal(null); setSuspendNote(""); }}
        onConfirm={() => {
          if (!suspendModal) return;
          void doAction(suspendModal.id, `/api/v1/admin/merchants/${suspendModal.id}/suspend`, "POST",
            { note: suspendNote || undefined }).then(() => { setSuspendModal(null); setSuspendNote(""); });
        }}
        extra={
          <FieldInput label="Reason (optional)" value={suspendNote}
            onChange={setSuspendNote} placeholder="e.g. Suspicious activity detected" mono={false} />
        }
      />

      <ConfirmModal
        open={!!deleteModal}
        title={`Delete ${deleteModal?.name ?? "merchant"} permanently?`}
        message="All their orders, splits, and ledger entries will be deleted. This cannot be undone. Merchants with paid orders cannot be deleted."
        confirmLabel="Delete Forever"
        danger
        loading={!!deleteModal && actionLoading[deleteModal.id]}
        onCancel={() => setDeleteModal(null)}
        onConfirm={() => {
          if (!deleteModal) return;
          void doAction(deleteModal.id, `/api/v1/admin/merchants/${deleteModal.id}`, "DELETE", { confirm: "DELETE" })
            .then(() => setDeleteModal(null));
        }}
      />

      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
             style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="relative w-full max-w-md rounded-2xl p-6 shadow-2xl"
               style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
            <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl"
                 style={{ background: "linear-gradient(90deg, transparent, #16A97B, transparent)" }} />
            <p className="font-semibold text-sm mb-4" style={{ color: "var(--text-primary)" }}>
              Edit Merchant — {editModal.name}
            </p>
            <div className="space-y-3 mb-4">
              <FieldInput label="Name" value={editName} onChange={setEditName} placeholder={editModal.name} mono={false} />
              <FieldInput label="Webhook URL" value={editWebhook} onChange={setEditWebhook}
                placeholder={editModal.webhook_url ?? "https://…"} mono={false} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setEditModal(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}>
                Cancel
              </button>
              <button type="button"
                disabled={actionLoading[editModal.id]}
                onClick={() => {
                  const body: Record<string, string | null> = {};
                  if (editName.trim())    body["name"]       = editName.trim();
                  if (editWebhook !== "") body["webhookUrl"] = editWebhook.trim() || null;
                  void adminFetch("PATCH", `/api/v1/admin/merchants/${editModal.id}`, secret, body)
                    .then(() => { void load(); setEditModal(null); })
                    .catch((e) => { setActionResults((p) => ({ ...p, [editModal.id]: { ok: false, data: String(e) } })); });
                }}
                className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                style={{ background: "rgba(22,169,123,0.15)", border: "1px solid rgba(22,169,123,0.3)", color: "#16A97B" }}>
                {actionLoading[editModal.id] && <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <SectionHeader
        title="Merchants"
        subtitle={merchants ? `${merchants.length} total` : "Loading…"}
        action={
          <ActionBtn onClick={() => void load()} loading={loading} small>
            <RefreshCw className="w-3 h-3" /> Refresh
          </ActionBtn>
        }
      />

      {error && (
        <div className="mb-4 text-xs text-red-400 p-3 rounded-lg flex items-center gap-2"
             style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="w-full rounded-lg pl-9 pr-3 py-2 text-sm outline-none transition-all"
          style={{ background: "var(--bg-base)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
          onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
        />
      </div>

      {loading && !merchants && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading merchants…
        </div>
      )}

      {filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((m) => (
            <div key={m.id} className="rounded-xl p-4"
                 style={{
                   background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
                   border: `1px solid ${m.suspended ? "rgba(239,68,68,0.35)" : "var(--border)"}`,
                 }}>
              {/* Header row */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate" style={{ color: "var(--text-primary)" }}>{m.name}</p>
                    {m.email_verified
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: "rgba(22,169,123,0.12)", color: "#16A97B" }}>Verified</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>Unverified</span>}
                    {m.suspended && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444" }}>Suspended</span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{m.email}</p>
                  {m.suspended && m.suspended_note && (
                    <p className="text-[10px] mt-1 italic" style={{ color: "#ef4444" }}>Reason: {m.suspended_note}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {new Date(m.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-[10px] mt-0.5 font-mono" style={{ color: "var(--text-muted)" }}>
                    ID: {m.id.slice(0, 12)}…
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: "Total", value: m.total_orders },
                  { label: "Paid",  value: m.orders_paid,      color: "#22c55e" },
                  { label: "Issues", value: m.orders_exception, color: m.orders_exception > 0 ? "#ef4444" : undefined },
                ].map(({ label, value, color }) => (
                  <div key={label} className="rounded-lg px-3 py-2 text-center"
                       style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[10px] font-medium uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
                    <p className="text-lg font-bold tabular-nums" style={{ color: color ?? "var(--text-primary)" }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] mb-3" style={{ color: "var(--text-muted)" }}>
                {m.api_key_prefix && (
                  <span className="font-mono flex items-center gap-1">
                    Key: {m.api_key_prefix}… <CopyBtn text={m.api_key_prefix} />
                  </span>
                )}
                {!m.api_key_prefix && <span className="italic">No API key issued</span>}
                {m.webhook_url && (
                  <span className="flex items-center gap-1 truncate max-w-[200px]">
                    <ExternalLink className="w-3 h-3 shrink-0" />{m.webhook_url}
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                {/* Suspend / Reactivate */}
                {!m.suspended ? (
                  <ActionBtn small danger onClick={() => { setSuspendNote(""); setSuspendModal({ id: m.id, name: m.name }); }}
                    loading={actionLoading[m.id]}>
                    <Ban className="w-3 h-3" /> Suspend
                  </ActionBtn>
                ) : (
                  <ActionBtn small onClick={() => void doAction(m.id, `/api/v1/admin/merchants/${m.id}/reactivate`, "POST")}
                    loading={actionLoading[m.id]}>
                    <UserCheck className="w-3 h-3" /> Reactivate
                  </ActionBtn>
                )}

                {/* Force-verify */}
                {!m.email_verified && (
                  <ActionBtn small onClick={() => void doAction(m.id, `/api/v1/admin/merchants/${m.id}/force-verify`, "POST")}
                    loading={actionLoading[m.id]}>
                    <CheckCircle2 className="w-3 h-3" /> Force Verify
                  </ActionBtn>
                )}

                {/* Revoke key */}
                {m.api_key_prefix && (
                  <ActionBtn small danger onClick={() => void doAction(m.id, `/api/v1/admin/merchants/${m.id}/revoke-key`, "POST")}
                    loading={actionLoading[m.id]}>
                    <KeyRound className="w-3 h-3" /> Revoke Key
                  </ActionBtn>
                )}

                {/* Edit */}
                <ActionBtn small onClick={() => { setEditModal(m); setEditName(m.name); setEditWebhook(m.webhook_url ?? ""); }}>
                  <Edit3 className="w-3 h-3" /> Edit
                </ActionBtn>

                {/* Delete */}
                <ActionBtn small danger onClick={() => setDeleteModal({ id: m.id, name: m.name })}>
                  <Trash2 className="w-3 h-3" /> Delete
                </ActionBtn>
              </div>

              {/* Action result */}
              {actionResults[m.id] && (
                <ResultBox result={actionResults[m.id] ?? null} />
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          {search ? "No merchants match your search." : "No merchants yet."}
        </div>
      )}
    </div>
  );
}

// ─── Section: Orders ──────────────────────────────────────────────────────────

function OrdersSection({ secret }: { secret: string }) {
  const [orders, setOrders] = React.useState<AdminOrder[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [filters, setFilters] = React.useState({
    status: "", merchant: "", dateFrom: "", dateTo: "",
  });

  // Order detail drawer
  const [detailRef, setDetailRef] = React.useState<string | null>(null);
  const [detail, setDetail]       = React.useState<AdminOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError]     = React.useState("");
  const [expandedPayload, setExpandedPayload] = React.useState<Record<number, boolean>>({});

  // Force-pay
  const [forcePayModal, setForcePayModal] = React.useState(false);
  const [forcePayAmount, setForcePayAmount] = React.useState("");
  const [forcePayNote, setForcePayNote]     = React.useState("");
  const [forcePayLoading, setForcePayLoading] = React.useState(false);
  const [forcePayResult, setForcePayResult]   = React.useState<PanelResult | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (filters.status)   params.append("status",      filters.status);
      if (filters.merchant) params.append("merchant_id", filters.merchant);
      if (filters.dateFrom) params.append("date_from",   filters.dateFrom);
      if (filters.dateTo)   params.append("date_to",     filters.dateTo);
      params.append("page_size", "100");
      const res = await adminFetch<{ results: AdminOrder[]; total_count: number }>(
        "GET", `/api/v1/admin/orders?${params.toString()}`, secret
      );
      setOrders(res.results);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  async function loadDetail(orderRef: string) {
    setDetailRef(orderRef); setDetail(null); setDetailError(""); setForcePayResult(null);
    setDetailLoading(true);
    try {
      const data = await adminFetch<AdminOrderDetail>("GET", `/api/v1/admin/orders/${orderRef}`, secret);
      setDetail(data);
      setForcePayAmount(String(data.expected_amount_kobo));
    } catch (e) { setDetailError(String(e)); }
    finally { setDetailLoading(false); }
  }

  async function doForcePay() {
    if (!detail) return;
    setForcePayLoading(true); setForcePayResult(null);
    try {
      const data = await adminFetch("POST", `/api/v1/admin/orders/${detail.order_ref}/force-pay`, secret, {
        amount_kobo: parseInt(forcePayAmount, 10) || detail.expected_amount_kobo,
        note: forcePayNote || undefined,
      });
      setForcePayResult({ ok: true, data });
      setForcePayModal(false);
      await loadDetail(detail.order_ref);
      await load();
    } catch (e) {
      setForcePayResult({ ok: false, data: String(e) });
    } finally {
      setForcePayLoading(false);
    }
  }

  React.useEffect(() => { void load(); }, [filters]);

  const ENTRY_TYPE_COLORS: Record<string, string> = {
    payment_received: "#22c55e",
    split_payout:     "#16A97B",
    refund_issued:    "#f59e0b",
    adjustment:       "#a855f7",
  };

  return (
    <div>
      <ConfirmModal
        open={forcePayModal && !!detail}
        title={`Force-pay ${detail?.order_ref ?? ""}?`}
        message="This manually marks the order as paid and records a payment_received ledger entry. Splits are NOT auto-executed."
        confirmLabel="Force Pay"
        loading={forcePayLoading}
        onCancel={() => setForcePayModal(false)}
        onConfirm={() => void doForcePay()}
        extra={
          <div className="space-y-3">
            <FieldInput label="Amount (kobo)" value={forcePayAmount} onChange={setForcePayAmount}
              placeholder={String(detail?.expected_amount_kobo ?? "")} />
            <FieldInput label="Admin note (optional)" value={forcePayNote} onChange={setForcePayNote}
              placeholder="e.g. Confirmed via bank statement" mono={false} />
          </div>
        }
      />

      {/* Order detail drawer */}
      <Drawer
        open={!!detailRef}
        onClose={() => { setDetailRef(null); setDetail(null); setForcePayResult(null); }}
        title={detailRef ? `Order ${detailRef}` : "Order Detail"}
        subtitle={detail ? `${detail.merchant.name} · ${detail.status}` : undefined}
      >
        {detailLoading && (
          <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            Loading order detail…
          </div>
        )}
        {detailError && (
          <div className="text-xs text-red-400 p-3 rounded-lg"
               style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
            {detailError}
          </div>
        )}
        {detail && (
          <>
            {/* Summary tiles */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Expected" value={formatNaira(detail.expected_amount_kobo)} accent="#16A97B" />
              <StatTile label="Received" value={detail.received_amount_kobo ? formatNaira(detail.received_amount_kobo) : "—"} />
            </div>

            {/* Detail fields */}
            <div className="rounded-xl p-4 space-y-2.5 text-xs"
                 style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              {[
                ["Status",          <StatusPill status={detail.status} key="s" />],
                ["Customer",        detail.customer_name],
                ["Virtual Account", detail.virtual_account_number ?? "—"],
                ["Bank",            detail.bank_name ?? "—"],
                ["Sender",          detail.sender_name ?? "—"],
                ["Sender Account",  detail.sender_account_number ?? "—"],
                ["Created",         new Date(detail.created_at).toLocaleString("en-NG")],
                ["Last Updated",    new Date(detail.updated_at).toLocaleString("en-NG")],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex items-start justify-between gap-4">
                  <span className="text-[10px] uppercase tracking-wider font-semibold shrink-0"
                        style={{ color: "var(--text-muted)" }}>{label}</span>
                  <span className="font-mono text-right" style={{ color: "var(--text-primary)" }}>{val}</span>
                </div>
              ))}
            </div>

            {/* Force pay action */}
            {!["paid", "refunded"].includes(detail.status) && (
              <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
                <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Admin Actions</p>
                <ActionBtn onClick={() => { setForcePayAmount(String(detail.expected_amount_kobo)); setForcePayModal(true); }}>
                  <ChevronsRight className="w-3.5 h-3.5" /> Force Mark Paid
                </ActionBtn>
                {forcePayResult && <ResultBox result={forcePayResult} />}
              </div>
            )}

            {/* Splits */}
            {detail.splits.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
                   style={{ color: "var(--text-muted)" }}>Splits ({detail.splits.length})</p>
                <div className="space-y-2">
                  {detail.splits.map((s, i) => (
                    <div key={i} className="rounded-lg px-3 py-2.5 flex items-center justify-between text-xs"
                         style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <div>
                        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{s.party}</p>
                        <p className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{s.account_number} · {s.bank_code}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>
                          {s.amount_kobo ? formatNaira(s.amount_kobo) : `${s.percentage}%`}
                        </p>
                        <StatusPill status={s.status} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ledger entries */}
            {detail.ledger_entries.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
                   style={{ color: "var(--text-muted)" }}>Ledger ({detail.ledger_entries.length} entries)</p>
                <div className="space-y-1.5">
                  {detail.ledger_entries.map((e) => (
                    <div key={e.id} className="rounded-lg px-3 py-2 flex items-center gap-3 text-xs"
                         style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                      <span className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: ENTRY_TYPE_COLORS[e.entry_type] ?? "#94a3b8" }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
                          {e.entry_type.replace(/_/g, " ")}
                        </p>
                        {e.narration && <p className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>{e.narration}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono font-semibold"
                           style={{ color: e.amount_kobo >= 0 ? "#22c55e" : "#ef4444" }}>
                          {e.amount_kobo >= 0 ? "+" : ""}{formatNaira(Math.abs(e.amount_kobo))}
                        </p>
                        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                          {new Date(e.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Webhook events */}
            {detail.webhook_events.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-2"
                   style={{ color: "var(--text-muted)" }}>Webhook Events ({detail.webhook_events.length})</p>
                <div className="space-y-1.5">
                  {detail.webhook_events.map((e) => (
                    <div key={e.id} className="rounded-lg overflow-hidden"
                         style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                      <button type="button"
                        className="w-full flex items-center justify-between px-3 py-2 text-xs text-left"
                        style={{ background: "rgba(255,255,255,0.03)", color: "var(--text-primary)" }}
                        onClick={() => setExpandedPayload((p) => ({ ...p, [e.id]: !p[e.id] }))}>
                        <span className="flex items-center gap-2">
                          <Webhook className="w-3 h-3 shrink-0" style={{ color: "#16A97B" }} />
                          <span className="font-semibold">{e.event_type}</span>
                          <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                            {e.request_id.slice(0, 16)}…
                          </span>
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <span style={{ color: "var(--text-muted)" }}>
                            {new Date(e.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          {expandedPayload[e.id] ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </span>
                      </button>
                      {expandedPayload[e.id] && (
                        <pre className="px-3 py-2 text-[10px] font-mono overflow-x-auto"
                             style={{ background: "var(--bg-base)", color: "var(--text-secondary)", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                          {JSON.stringify(e.raw_payload, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Drawer>

      <SectionHeader
        title="Order Management"
        subtitle={orders ? `${orders.length} orders · click a row for full detail` : "Loading…"}
        action={
          <ActionBtn onClick={() => void load()} loading={loading} small>
            <RefreshCw className="w-3 h-3" /> Refresh
          </ActionBtn>
        }
      />

      {error && (
        <div className="mb-4 text-xs text-red-400 p-3 rounded-lg flex items-center gap-2"
             style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <select
          value={filters.status}
          onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: "var(--bg-base)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}>
          <option value="">All Statuses</option>
          {["pending","paid","underpayment","overpayment","unmatched","expired","refunded"].map(s => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
        <input type="date" value={filters.dateFrom}
          onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: "var(--bg-base)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }} />
        <input type="date" value={filters.dateTo}
          onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: "var(--bg-base)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }} />
        <ActionBtn onClick={() => setFilters({ status: "", merchant: "", dateFrom: "", dateTo: "" })} small>
          Clear Filters
        </ActionBtn>
      </div>

      {loading && !orders && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading orders…
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                {["Order Ref", "Merchant", "Customer", "Expected", "Received", "Status", "Date"].map((h) => (
                  <th key={h} className="px-3 py-3 text-left font-semibold uppercase tracking-wide"
                      style={{ color: "var(--text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.order_ref}
                    className="cursor-pointer transition-colors"
                    onClick={() => void loadDetail(o.order_ref)}
                    style={{ borderTop: "1px solid rgba(255,255,255,0.08)", background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)")}>
                  <td className="px-3 py-3 font-mono" style={{ color: "#16A97B" }}>{o.order_ref}</td>
                  <td className="px-3 py-3" style={{ color: "var(--text-secondary)" }}>{o.merchant_name}</td>
                  <td className="px-3 py-3" style={{ color: "var(--text-secondary)" }}>{o.customer_name}</td>
                  <td className="px-3 py-3 font-mono tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {formatNaira(o.expected_amount_kobo)}
                  </td>
                  <td className="px-3 py-3 font-mono tabular-nums" style={{ color: "var(--text-secondary)" }}>
                    {o.received_amount_kobo ? formatNaira(o.received_amount_kobo) : "—"}
                  </td>
                  <td className="px-3 py-3"><StatusPill status={o.status} /></td>
                  <td className="px-3 py-3" style={{ color: "var(--text-muted)" }}>
                    {new Date(o.created_at).toLocaleDateString("en-NG", { day: "2-digit", month: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && orders && orders.length === 0 && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          No orders match the current filters.
        </div>
      )}
    </div>
  );
}

// ─── Section: Tools ───────────────────────────────────────────────────────────

function ToolsSection({ secret }: { secret: string }) {
  const [bankLookup, setBankLookup] = React.useState({ bankCode: "", accountNumber: "" });
  const [expireOrders, setExpireOrders] = React.useState("");
  const [resetOrder, setResetOrder] = React.useState("");
  const [results, setResults] = React.useState<Record<string, PanelResult | null>>({});
  const [loading, setLoading] = React.useState<Record<string, boolean>>({});

  async function testBankLookup() {
    if (!bankLookup.bankCode || !bankLookup.accountNumber) return;
    
    setLoading(prev => ({ ...prev, bankLookup: true }));
    try {
      const result = await adminFetch("POST", "/api/v1/admin/test-lookup", secret, {
        bankCode: bankLookup.bankCode,
        accountNumber: bankLookup.accountNumber,
      });
      setResults(prev => ({ ...prev, bankLookup: { ok: true, data: result } }));
    } catch (e) {
      setResults(prev => ({ ...prev, bankLookup: { ok: false, data: String(e) } }));
    } finally {
      setLoading(prev => ({ ...prev, bankLookup: false }));
    }
  }

  async function bulkExpireOrders() {
    setLoading(prev => ({ ...prev, expire: true }));
    try {
      const body = expireOrders.trim() 
        ? { order_refs: expireOrders.split(",").map(s => s.trim()).filter(Boolean) }
        : {};
      const result = await adminFetch("POST", "/api/v1/admin/orders/expire-pending", secret, body);
      setResults(prev => ({ ...prev, expire: { ok: true, data: result } }));
    } catch (e) {
      setResults(prev => ({ ...prev, expire: { ok: false, data: String(e) } }));
    } finally {
      setLoading(prev => ({ ...prev, expire: false }));
    }
  }

  async function resetOrderAction() {
    if (!resetOrder.trim()) return;
    
    setLoading(prev => ({ ...prev, reset: true }));
    try {
      const result = await adminFetch("POST", `/api/v1/admin/orders/${resetOrder.trim()}/reset`, secret);
      setResults(prev => ({ ...prev, reset: { ok: true, data: result } }));
    } catch (e) {
      setResults(prev => ({ ...prev, reset: { ok: false, data: String(e) } }));
    } finally {
      setLoading(prev => ({ ...prev, reset: false }));
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader title="Admin Tools" subtitle="Utilities and maintenance functions" />

      {/* Bank Account Lookup */}
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
        <h3 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Bank Account Lookup</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <FieldInput
            label="Bank Code"
            value={bankLookup.bankCode}
            onChange={(v) => setBankLookup(prev => ({ ...prev, bankCode: v }))}
            placeholder="e.g. 058"
          />
          <FieldInput
            label="Account Number"
            value={bankLookup.accountNumber}
            onChange={(v) => setBankLookup(prev => ({ ...prev, accountNumber: v }))}
            placeholder="0123456789"
          />
          <div className="flex items-end">
            <ActionBtn onClick={() => void testBankLookup()} loading={loading.bankLookup}>
              <Search className="w-3 h-3" /> Lookup
            </ActionBtn>
          </div>
        </div>
        <ResultBox result={results.bankLookup ?? null} />
      </div>

      {/* Bulk Expire Orders */}
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
        <h3 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Bulk Expire Orders</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <FieldInput
            label="Order References (comma-separated, or leave empty for all pending)"
            value={expireOrders}
            onChange={setExpireOrders}
            placeholder="ord-001, ord-002 or leave empty"
          />
          <div className="flex items-end">
            <ActionBtn onClick={() => void bulkExpireOrders()} loading={loading.expire} danger>
              <Clock className="w-3 h-3" /> Expire Orders
            </ActionBtn>
          </div>
        </div>
        <ResultBox result={results.expire ?? null} />
      </div>

      {/* Reset Order */}
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
        <h3 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Reset Order</h3>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          Resets an order back to pending, clears payment data, and removes webhook events.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <FieldInput
            label="Order Reference"
            value={resetOrder}
            onChange={setResetOrder}
            placeholder="ord-001"
          />
          <div className="flex items-end">
            <ActionBtn onClick={() => void resetOrderAction()} loading={loading.reset} danger>
              <RotateCcw className="w-3 h-3" /> Reset Order
            </ActionBtn>
          </div>
        </div>
        <ResultBox result={results.reset ?? null} />
      </div>
    </div>
  );
}

// ─── Section: Reconciliation ──────────────────────────────────────────────────

function ReconciliationSection({ secret }: { secret: string }) {
  const today = new Date().toISOString().split("T")[0] ?? "";
  const [dateRange, setDateRange] = React.useState({ from: today, to: today });
  const [result, setResult]       = React.useState<ReconcileResult | null>(null);
  const [loading, setLoading]     = React.useState(false);
  const [error, setError]         = React.useState("");
  const [expandedOrphan, setExpandedOrphan] = React.useState<Record<string, boolean>>({});

  async function runCheck() {
    setLoading(true); setError(""); setResult(null);
    try {
      const params = new URLSearchParams();
      if (dateRange.from) params.append("date_from", dateRange.from);
      if (dateRange.to)   params.append("date_to",   dateRange.to);
      const res = await adminFetch<ReconcileResult>(
        "GET", `/api/v1/admin/reconcile-check?${params.toString()}`, secret
      );
      setResult(res);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const totalIssues = (result?.orphans.length ?? 0) + (result?.drift.length ?? 0);
  const isClean     = result !== null && totalIssues === 0 && (result.total_checked > 0 || result.matched === 0);
  const isEmpty     = result !== null && result.total_checked === 0;

  return (
    <div>
      <SectionHeader
        title="Reconciliation"
        subtitle="Diff Nomba transactions against local ledger — runs nightly at 02:00 WAT"
      />

      {/* ── Controls card ── */}
      <div
        className="rounded-xl p-5 mb-5"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
        }}
      >
        <p className="text-xs font-semibold mb-3" style={{ color: "var(--text-muted)" }}>
          Date Range
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <FieldInput
              label="From"
              value={dateRange.from}
              onChange={(v) => setDateRange((p) => ({ ...p, from: v }))}
              type="date"
              mono={false}
            />
          </div>
          <div className="flex-1 min-w-[140px]">
            <FieldInput
              label="To"
              value={dateRange.to}
              onChange={(v) => setDateRange((p) => ({ ...p, to: v }))}
              type="date"
              mono={false}
            />
          </div>
          <ActionBtn onClick={() => void runCheck()} loading={loading}>
            <GitCompare className="w-3.5 h-3.5" />
            Run Reconciliation
          </ActionBtn>
        </div>

        {/* Inline cron note */}
        <p className="text-[11px] mt-3 flex items-center gap-1.5" style={{ color: "rgba(100,116,139,0.7)" }}>
          <Clock className="w-3 h-3 shrink-0" />
          The nightly cron runs this same check automatically for the previous day. Use the controls above to check any date range on demand.
        </p>
      </div>

      {/* ── Error ── */}
      {error && (
        <div
          className="mb-5 flex items-center gap-2 text-xs text-red-400 p-3.5 rounded-xl"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="py-16 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Querying Nomba and local ledger…
        </div>
      )}

      {/* ── Results ── */}
      {result && !loading && (
        <div className="space-y-4">

          {/* Stat tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatTile label="Nomba Transactions" value={result.total_checked} />
            <StatTile label="Matched"             value={result.matched}       accent="#22c55e" />
            <StatTile
              label="Orphans"
              value={result.orphans.length}
              accent={result.orphans.length > 0 ? "#ef4444" : "#22c55e"}
            />
            <StatTile
              label="Amount Drift"
              value={result.drift.length}
              accent={result.drift.length > 0 ? "#f59e0b" : "#22c55e"}
            />
          </div>

          {/* Meta row */}
          <div
            className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px] px-1"
            style={{ color: "rgba(100,116,139,0.7)" }}
          >
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Checked {new Date(result.checked_at).toLocaleString("en-NG")}
            </span>
            <span>
              {result.date_from === result.date_to
                ? `Date: ${result.date_from}`
                : `Range: ${result.date_from} → ${result.date_to}`}
            </span>
          </div>

          {/* ── All-clean banner ── */}
          {isClean && (
            <div
              className="flex items-center gap-3 rounded-xl p-4"
              style={{
                background: "linear-gradient(135deg, rgba(22,169,123,0.10) 0%, rgba(22,169,123,0.04) 100%)",
                border: "1px solid rgba(22,169,123,0.25)",
                boxShadow: "inset 0 1px 0 rgba(22,169,123,0.08)",
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(22,169,123,0.12)", border: "1px solid rgba(22,169,123,0.25)" }}
              >
                <CheckCircle2 className="w-4.5 h-4.5" style={{ color: "#16A97B" }} />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: "#16A97B" }}>
                  All transactions reconciled
                </p>
                <p className="text-xs mt-0.5" style={{ color: "rgba(22,169,123,0.7)" }}>
                  {result.matched} Nomba transaction{result.matched !== 1 ? "s" : ""} matched local ledger entries — no drift detected.
                </p>
              </div>
            </div>
          )}

          {/* ── No transactions banner ── */}
          {isEmpty && (
            <div
              className="flex items-center gap-3 rounded-xl p-4"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(100,116,139,0.10)", border: "1px solid rgba(100,116,139,0.2)" }}
              >
                <Terminal className="w-4 h-4" style={{ color: "#64748b" }} />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: "var(--text-secondary)" }}>
                  No transactions in this period
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Nomba returned zero successful transactions for {result.date_from}
                  {result.date_from !== result.date_to ? ` – ${result.date_to}` : ""}.
                </p>
              </div>
            </div>
          )}

          {/* ── Orphans ── */}
          {result.orphans.length > 0 && (
            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: "1px solid rgba(239,68,68,0.25)",
                background: "linear-gradient(135deg, rgba(239,68,68,0.06) 0%, rgba(239,68,68,0.02) 100%)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center gap-3 px-5 py-3.5"
                style={{ borderBottom: "1px solid rgba(239,68,68,0.15)" }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)" }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-red-400">
                    Orphaned Transactions ({result.orphans.length})
                  </p>
                  <p className="text-[11px]" style={{ color: "rgba(239,68,68,0.6)" }}>
                    On Nomba but missing from local ledger — likely a dropped webhook.
                    Use <span className="font-mono">Force Mark Paid</span> in Orders to resolve.
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "rgba(239,68,68,0.06)", borderBottom: "1px solid rgba(239,68,68,0.12)" }}>
                      {["Order Ref", "Transaction ID", "Amount", "Time on Nomba", ""].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide"
                          style={{ color: "rgba(239,68,68,0.6)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.orphans.map((o) => (
                      <React.Fragment key={o.transactionId}>
                        <tr
                          className="cursor-pointer transition-colors"
                          style={{ borderTop: "1px solid rgba(239,68,68,0.10)" }}
                          onClick={() =>
                            setExpandedOrphan((p) => ({ ...p, [o.transactionId]: !p[o.transactionId] }))
                          }
                        >
                          <td className="px-4 py-3 font-mono font-semibold" style={{ color: "#16A97B" }}>
                            {o.merchantTxRef || "—"}
                          </td>
                          <td className="px-4 py-3 font-mono" style={{ color: "var(--text-muted)" }}>
                            {o.transactionId ? `${o.transactionId.slice(0, 20)}…` : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                            {formatNaira(o.amount_kobo)}
                          </td>
                          <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>
                            {o.created_at
                              ? new Date(o.created_at).toLocaleString("en-NG", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {expandedOrphan[o.transactionId]
                              ? <ChevronUp className="w-3 h-3" style={{ color: "var(--text-muted)" }} />
                              : <ChevronDown className="w-3 h-3" style={{ color: "var(--text-muted)" }} />}
                          </td>
                        </tr>
                        {expandedOrphan[o.transactionId] && (
                          <tr style={{ borderTop: "1px solid rgba(239,68,68,0.08)" }}>
                            <td colSpan={5} className="px-4 py-3">
                              <pre
                                className="text-[10px] font-mono rounded-lg p-3 overflow-x-auto"
                                style={{ background: "rgba(239,68,68,0.06)", color: "var(--text-secondary)", border: "1px solid rgba(239,68,68,0.12)" }}
                              >
                                {JSON.stringify(o, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Amount drift ── */}
          {result.drift.length > 0 && (
            <div
              className="rounded-xl overflow-hidden"
              style={{
                border: "1px solid rgba(245,158,11,0.25)",
                background: "linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(245,158,11,0.02) 100%)",
              }}
            >
              {/* Header */}
              <div
                className="flex items-center gap-3 px-5 py-3.5"
                style={{ borderBottom: "1px solid rgba(245,158,11,0.15)" }}
              >
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)" }}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-yellow-400" />
                </div>
                <div>
                  <p className="font-semibold text-sm text-yellow-400">
                    Amount Drift ({result.drift.length})
                  </p>
                  <p className="text-[11px]" style={{ color: "rgba(245,158,11,0.6)" }}>
                    Transaction recorded locally but at a different amount than Nomba — investigate before any manual correction.
                  </p>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "rgba(245,158,11,0.06)", borderBottom: "1px solid rgba(245,158,11,0.12)" }}>
                      {["Order Ref", "Transaction ID", "Nomba Amount", "Local Amount", "Difference"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left font-semibold uppercase tracking-wide"
                          style={{ color: "rgba(245,158,11,0.6)" }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.drift.map((d) => {
                      const diff = d.nomba_amount_kobo - d.local_amount_kobo;
                      return (
                        <tr key={d.transactionId} style={{ borderTop: "1px solid rgba(245,158,11,0.10)" }}>
                          <td className="px-4 py-3 font-mono font-semibold" style={{ color: "#16A97B" }}>
                            {d.order_ref}
                          </td>
                          <td className="px-4 py-3 font-mono" style={{ color: "var(--text-muted)" }}>
                            {d.transactionId ? `${d.transactionId.slice(0, 20)}…` : "—"}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums" style={{ color: "var(--text-primary)" }}>
                            {formatNaira(d.nomba_amount_kobo)}
                          </td>
                          <td className="px-4 py-3 font-mono tabular-nums" style={{ color: "var(--text-primary)" }}>
                            {formatNaira(d.local_amount_kobo)}
                          </td>
                          <td
                            className="px-4 py-3 font-mono font-bold tabular-nums"
                            style={{ color: diff > 0 ? "#f59e0b" : "#ef4444" }}
                          >
                            {diff > 0 ? "+" : ""}{formatNaira(Math.abs(diff))}
                            <span className="text-[10px] font-normal ml-1" style={{ color: "var(--text-muted)" }}>
                              {diff > 0 ? "under-recorded" : "over-recorded"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section: Webhook Events ──────────────────────────────────────────────────

function WebhookEventsSection({ secret }: { secret: string }) {
  const [events, setEvents]   = React.useState<WebhookEvent[] | null>(null);
  const [total, setTotal]     = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState("");
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({});
  const [filters, setFilters] = React.useState({
    orderRef: "", eventType: "", dateFrom: "", dateTo: "",
  });

  async function load() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page_size: "100" });
      if (filters.orderRef)  params.append("order_ref",  filters.orderRef);
      if (filters.eventType) params.append("event_type", filters.eventType);
      if (filters.dateFrom)  params.append("date_from",  filters.dateFrom);
      if (filters.dateTo)    params.append("date_to",    filters.dateTo);
      const res = await adminFetch<{ results: WebhookEvent[]; total_count: number }>(
        "GET", `/api/v1/admin/webhook-events?${params.toString()}`, secret
      );
      setEvents(res.results);
      setTotal(res.total_count);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { void load(); }, []);

  return (
    <div>
      <SectionHeader
        title="Webhook Event Log"
        subtitle={events ? `${total} total events · showing ${events.length}` : "Loading…"}
        action={
          <ActionBtn onClick={() => void load()} loading={loading} small>
            <RefreshCw className="w-3 h-3" /> Refresh
          </ActionBtn>
        }
      />

      {error && (
        <div className="mb-4 text-xs text-red-400 p-3 rounded-lg flex items-center gap-2"
             style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <input value={filters.orderRef} onChange={(e) => setFilters(p => ({ ...p, orderRef: e.target.value }))}
          placeholder="Filter by order ref"
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: "var(--bg-base)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }} />
        <input value={filters.eventType} onChange={(e) => setFilters(p => ({ ...p, eventType: e.target.value }))}
          placeholder="Filter by event type"
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: "var(--bg-base)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }} />
        <input type="date" value={filters.dateFrom}
          onChange={(e) => setFilters(p => ({ ...p, dateFrom: e.target.value }))}
          className="rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: "var(--bg-base)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }} />
        <ActionBtn small onClick={() => { setFilters({ orderRef: "", eventType: "", dateFrom: "", dateTo: "" }); void load(); }}>
          Clear + Reload
        </ActionBtn>
      </div>

      {loading && !events && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading events…
        </div>
      )}

      {events && events.length > 0 && (
        <div className="space-y-1.5">
          {events.map((e) => (
            <div key={e.id} className="rounded-xl overflow-hidden"
                 style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
              <button type="button"
                className="w-full flex items-center justify-between px-4 py-3 text-xs text-left transition-colors"
                style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", color: "var(--text-primary)" }}
                onClick={() => setExpanded((p) => ({ ...p, [e.id]: !p[e.id] }))}>
                <span className="flex items-center gap-3 min-w-0">
                  <Webhook className="w-3.5 h-3.5 shrink-0" style={{ color: "#16A97B" }} />
                  <span className="font-semibold">{e.event_type}</span>
                  <span className="font-mono text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                    {e.request_id}
                  </span>
                </span>
                <span className="flex items-center gap-3 shrink-0 ml-3">
                  {e.processed_at
                    ? <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: "rgba(22,169,123,0.12)", color: "#16A97B" }}>Processed</span>
                    : <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>Unprocessed</span>}
                  <span style={{ color: "var(--text-muted)" }}>
                    {new Date(e.created_at).toLocaleString("en-NG", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {expanded[e.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </span>
              </button>
              {expanded[e.id] && (
                <pre className="px-4 py-3 text-[11px] font-mono overflow-x-auto"
                     style={{
                       background: "var(--bg-base)", color: "var(--text-secondary)",
                       borderTop: "1px solid rgba(255,255,255,0.08)",
                       maxHeight: "320px", overflowY: "auto",
                     }}>
                  {JSON.stringify(e.raw_payload, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}

      {!loading && events && events.length === 0 && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          No webhook events match your filters.
        </div>
      )}
    </div>
  );
}

// ─── Section: System Health ───────────────────────────────────────────────────

function SystemHealthSection({ secret }: { secret: string }) {
  const [health, setHealth]   = React.useState<SystemHealth | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError]     = React.useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const data = await adminFetch<SystemHealth>("GET", "/api/v1/admin/system-health", secret);
      setHealth(data);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { void load(); }, []);

  const STATUS_REQUIRED = [
    "DATABASE_URL", "DIRECT_URL",
    "NOMBA_BASE_URL", "NOMBA_CLIENT_ID", "NOMBA_CLIENT_SECRET",
    "NOMBA_ACCOUNT_ID", "NOMBA_SUB_ACCOUNT_ID", "NOMBA_WEBHOOK_SECRET",
    "ADMIN_SECRET",
  ];
  const STATUS_OPTIONAL = [
    "FRONTEND_URL", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "REDIS_URL",
  ];

  function EnvRow({ name, present, required }: { name: string; present: boolean; required: boolean }) {
    return (
      <div className="flex items-center justify-between py-2 text-xs"
           style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <span className="font-mono" style={{ color: "var(--text-secondary)" }}>{name}</span>
        <span className="flex items-center gap-1.5">
          {present ? (
            <><CheckCircle2 className="w-3.5 h-3.5 text-green-400" /><span className="text-green-400">Set</span></>
          ) : required ? (
            <><XCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-red-400">Missing</span></>
          ) : (
            <><AlertTriangle className="w-3.5 h-3.5 text-yellow-500" /><span className="text-yellow-500">Not set (optional)</span></>
          )}
        </span>
      </div>
    );
  }

  return (
    <div>
      <SectionHeader
        title="System Health"
        subtitle="Environment, database, and process diagnostics"
        action={
          <ActionBtn onClick={() => void load()} loading={loading} small>
            <RefreshCw className="w-3 h-3" /> Refresh
          </ActionBtn>
        }
      />

      {error && (
        <div className="mb-4 text-xs text-red-400 p-3 rounded-lg flex items-center gap-2"
             style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {loading && !health && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Running diagnostics…
        </div>
      )}

      {health && (
        <div className="space-y-5">
          {/* Status banner */}
          <div className="rounded-xl p-4 flex items-center gap-3"
               style={{
                 background: health.status === "healthy" ? "rgba(22,169,123,0.08)" : "rgba(239,68,68,0.08)",
                 border: `1px solid ${health.status === "healthy" ? "rgba(22,169,123,0.25)" : "rgba(239,68,68,0.25)"}`,
               }}>
            {health.status === "healthy"
              ? <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
              : <ServerCrash className="w-5 h-5 text-red-400 shrink-0" />}
            <div>
              <p className="font-semibold text-sm" style={{ color: health.status === "healthy" ? "#22c55e" : "#ef4444" }}>
                {health.status === "healthy" ? "All systems operational" : "System degraded — check details below"}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Checked at {new Date(health.timestamp).toLocaleString("en-NG")} · Uptime {Math.floor(health.uptime_seconds / 60)}m {health.uptime_seconds % 60}s
              </p>
            </div>
          </div>

          {/* DB + Process tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-3.5 h-3.5" style={{ color: "#16A97B" }} />
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Database</p>
              </div>
              <p className="text-xl font-bold" style={{ color: health.database.connected ? "#22c55e" : "#ef4444" }}>
                {health.database.connected ? "Connected" : "Down"}
              </p>
              {health.database.latency_ms !== null && (
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{health.database.latency_ms}ms latency</p>
              )}
            </div>
            <StatTile label="Total Orders"    value={health.database.total_orders    ?? "—"} accent="#16A97B" />
            <StatTile label="Total Merchants" value={health.database.total_merchants ?? "—"} />
            <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="w-3.5 h-3.5" style={{ color: "#a855f7" }} />
                <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Memory</p>
              </div>
              <p className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>{health.process.memory_mb} MB</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{health.process.node_version} · {health.process.env}</p>
            </div>
          </div>

          {/* Env var checklist */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Required Variables</p>
              {STATUS_REQUIRED.map((name) => (
                <EnvRow key={name} name={name} present={health.env.vars[name] ?? false} required={true} />
              ))}
            </div>
            <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}>
              <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>Optional Variables</p>
              {STATUS_OPTIONAL.map((name) => (
                <EnvRow key={name} name={name} present={health.env.vars[name] ?? false} required={false} />
              ))}
              <div className="mt-4 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "var(--text-muted)" }}>Process</p>
                {[
                  ["Node",     health.process.node_version],
                  ["Platform", health.process.platform],
                  ["Env",      health.process.env],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1.5 text-xs" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <span style={{ color: "var(--text-muted)" }}>{k}</span>
                    <span className="font-mono" style={{ color: "var(--text-secondary)" }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section: Support Tickets ────────────────────────────────────────────────

interface AdminSupportTicket {
  id:         number;
  merchant:   { id: string; name: string; email: string };
  summary:    string;
  status:     "open" | "resolved";
  resolution: string | null;
  messages:   Array<{ role: string; content: string }>;
  created_at: string;
  updated_at: string;
}

function SupportSection({ secret }: { secret: string }) {
  const [tickets, setTickets]   = React.useState<AdminSupportTicket[] | null>(null);
  const [total, setTotal]       = React.useState(0);
  const [loading, setLoading]   = React.useState(false);
  const [error, setError]       = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"" | "open" | "resolved">("");
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({});
  const [resolveModal, setResolveModal] = React.useState<AdminSupportTicket | null>(null);
  const [resolutionNote, setResolutionNote] = React.useState("");
  const [resolving, setResolving] = React.useState(false);
  const [resolveResult, setResolveResult] = React.useState<PanelResult | null>(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams({ page_size: "50" });
      if (statusFilter) params.append("status", statusFilter);
      const res = await adminFetch<{ results: AdminSupportTicket[]; total_count: number }>(
        "GET", `/api/v1/admin/support-tickets?${params.toString()}`, secret
      );
      setTickets(res.results);
      setTotal(res.total_count);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  React.useEffect(() => { void load(); }, [statusFilter]);

  async function resolveTicket() {
    if (!resolveModal) return;
    setResolving(true); setResolveResult(null);
    try {
      const data = await adminFetch(
        "PATCH",
        `/api/v1/admin/support-tickets/${resolveModal.id}/resolve`,
        secret,
        { note: resolutionNote.trim() || undefined }
      );
      setResolveResult({ ok: true, data });
      setResolveModal(null);
      setResolutionNote("");
      await load();
    } catch (e) {
      setResolveResult({ ok: false, data: String(e) });
    } finally {
      setResolving(false);
    }
  }

  const openCount     = tickets?.filter((t) => t.status === "open").length ?? 0;

  return (
    <div>
      <ConfirmModal
        open={!!resolveModal}
        title={`Resolve ticket #${resolveModal?.id ?? ""}?`}
        message="Mark this ticket as resolved and optionally add a reply note the merchant will see."
        confirmLabel="Mark Resolved"
        loading={resolving}
        onCancel={() => { setResolveModal(null); setResolutionNote(""); }}
        onConfirm={() => void resolveTicket()}
        extra={
          <FieldInput
            label="Reply / resolution note (optional)"
            value={resolutionNote}
            onChange={setResolutionNote}
            placeholder="e.g. Your API key has been reset. Please re-issue from Settings."
            mono={false}
          />
        }
      />

      <SectionHeader
        title="Support Tickets"
        subtitle={tickets ? `${total} total · ${openCount} open` : "Loading…"}
        action={
          <ActionBtn onClick={() => void load()} loading={loading} small>
            <RefreshCw className="w-3 h-3" /> Refresh
          </ActionBtn>
        }
      />

      {error && (
        <div className="mb-4 text-xs text-red-400 p-3 rounded-lg flex items-center gap-2"
             style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}

      {resolveResult && <ResultBox result={resolveResult} />}

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {([
          { value: "" as const,         label: "All" },
          { value: "open" as const,     label: "Open" },
          { value: "resolved" as const, label: "Resolved" },
        ]).map(({ value, label }) => (
          <button
            key={label}
            type="button"
            onClick={() => setStatusFilter(value)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer"
            style={{
              background: statusFilter === value ? "rgba(22,169,123,0.15)" : "rgba(255,255,255,0.04)",
              border: statusFilter === value ? "1px solid rgba(22,169,123,0.3)" : "1px solid rgba(255,255,255,0.08)",
              color: statusFilter === value ? "#16A97B" : "var(--text-muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !tickets && (
        <div className="py-12 text-center text-sm" style={{ color: "var(--text-muted)" }}>
          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          Loading tickets…
        </div>
      )}

      {!loading && tickets && tickets.length === 0 && (
        <div className="py-12 text-center" style={{ color: "var(--text-muted)" }}>
          <Ticket className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No {statusFilter || ""} support tickets.</p>
        </div>
      )}

      {tickets && tickets.length > 0 && (
        <div className="space-y-3">
          {tickets.map((t) => (
            <div
              key={t.id}
              className="rounded-xl overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
                border: t.status === "open"
                  ? "1px solid rgba(245,158,11,0.25)"
                  : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {/* Ticket header */}
              <button
                type="button"
                className="w-full flex items-start justify-between gap-3 px-4 py-3 text-left cursor-pointer"
                onClick={() => setExpanded((p) => ({ ...p, [t.id]: !p[t.id] }))}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: t.status === "open" ? "rgba(245,158,11,0.12)" : "rgba(22,169,123,0.10)",
                      border: t.status === "open" ? "1px solid rgba(245,158,11,0.25)" : "1px solid rgba(22,169,123,0.20)",
                    }}
                  >
                    <MessageCircle className="w-3.5 h-3.5" style={{ color: t.status === "open" ? "#f59e0b" : "#16A97B" }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                        #{t.id} · {t.merchant.name}
                      </span>
                      <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                        style={{
                          background: t.status === "open" ? "rgba(245,158,11,0.15)" : "rgba(22,169,123,0.12)",
                          color: t.status === "open" ? "#f59e0b" : "#16A97B",
                        }}
                      >
                        {t.status === "open" ? "Open" : "Resolved"}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
                      {t.summary}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {t.merchant.email} · {new Date(t.created_at).toLocaleString("en-NG", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.status === "open" && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setResolveModal(t); setResolutionNote(""); }}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-semibold cursor-pointer transition-all"
                      style={{ background: "rgba(22,169,123,0.12)", border: "1px solid rgba(22,169,123,0.25)", color: "#16A97B" }}
                    >
                      Resolve
                    </button>
                  )}
                  {expanded[t.id] ? <ChevronUp className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} /> : <ChevronDown className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />}
                </div>
              </button>

              {/* Expanded conversation */}
              {expanded[t.id] && (
                <div className="px-4 pb-4 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest pt-3 mb-2" style={{ color: "var(--text-muted)" }}>
                    Conversation
                  </p>
                  {t.messages.map((m, i) => (
                    <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                      <div
                        className="rounded-xl px-3 py-2 text-xs max-w-[80%]"
                        style={{
                          background: m.role === "user"
                            ? "rgba(22,169,123,0.10)"
                            : "rgba(255,255,255,0.04)",
                          border: `1px solid ${m.role === "user" ? "rgba(22,169,123,0.2)" : "rgba(255,255,255,0.08)"}`,
                          color: "var(--text-primary)",
                        }}
                      >
                        <p className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--text-muted)" }}>
                          {m.role === "user" ? "Merchant" : "AI Assistant"}
                        </p>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {t.resolution && (
                    <div className="mt-2 p-3 rounded-xl text-xs"
                         style={{ background: "rgba(22,169,123,0.06)", border: "1px solid rgba(22,169,123,0.2)" }}>
                      <p className="text-[10px] font-semibold mb-1" style={{ color: "#16A97B" }}>Team Reply</p>
                      <p style={{ color: "var(--text-primary)" }}>{t.resolution}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Section: Danger Zone ─────────────────────────────────────────────────────

function DangerSection({ secret }: { secret: string }) {
  const [confirmNuke, setConfirmNuke] = React.useState("");
  const [result, setResult] = React.useState<PanelResult | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function executeNuke() {
    if (confirmNuke !== "DELETE ALL DATA") return;
    
    setLoading(true);
    try {
      const res = await adminFetch("POST", "/api/v1/admin/nuke", secret);
      setResult({ ok: true, data: res });
      setConfirmNuke("");
    } catch (e) {
      setResult({ ok: false, data: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <SectionHeader 
        title="Danger Zone" 
        subtitle="Irreversible actions - use with extreme caution" 
      />

      <div className="rounded-xl p-4 border-2 border-red-500/30"
           style={{ background: "rgba(239,68,68,0.05)" }}>
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-400 mb-1">Nuclear Option</h3>
            <p className="text-sm text-red-300 mb-3">
              This will permanently delete ALL orders, splits, ledger entries, and webhook events. 
              Virtual accounts will be expired on Nomba. Merchants are preserved.
            </p>
            <p className="text-xs text-red-200 mb-3">
              Type <code className="bg-red-900/50 px-1 rounded">DELETE ALL DATA</code> to confirm:
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input
            type="text"
            value={confirmNuke}
            onChange={(e) => setConfirmNuke(e.target.value)}
            placeholder="DELETE ALL DATA"
            className="rounded-lg px-3 py-2 text-sm font-mono outline-none border-2 border-red-500/50"
            style={{ background: "rgba(239,68,68,0.1)", color: "var(--text-primary)" }}
          />
          <ActionBtn
            onClick={() => void executeNuke()}
            loading={loading}
            disabled={confirmNuke !== "DELETE ALL DATA"}
            danger
          >
            <Trash2 className="w-3 h-3" /> Execute Nuclear Option
          </ActionBtn>
        </div>

        <ResultBox result={result} />
      </div>
    </div>
  );
}

// ─── Main Admin Component ─────────────────────────────────────────────────────

export function AdminPage() {
  const [secret, setSecret]             = React.useState<string | null>(null);
  const [activeSection, setActiveSection] = React.useState<NavSection>("overview");
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // Close mobile nav on section change
  function navigateTo(id: NavSection) {
    setActiveSection(id);
    setMobileNavOpen(false);
  }

  // Close on Escape
  React.useEffect(() => {
    if (!mobileNavOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileNavOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileNavOpen]);

  if (!secret) {
    return <AdminLogin onAuth={setSecret} />;
  }

  const sections = [
    { id: "overview"  as const, label: "Overview",  icon: LayoutDashboard, component: OverviewSection  },
    { id: "merchants" as const, label: "Merchants", icon: Users,           component: MerchantsSection },
    { id: "orders"    as const, label: "Orders",    icon: Receipt,         component: OrdersSection    },
    { id: "reconcile" as const, label: "Reconcile", icon: GitCompare,      component: ReconciliationSection },
    { id: "webhooks"  as const, label: "Webhooks",  icon: Webhook,         component: WebhookEventsSection  },
    { id: "health"    as const, label: "Health",    icon: Activity,        component: SystemHealthSection   },
    { id: "tools"     as const, label: "Tools",    icon: Wrench,          component: ToolsSection     },
    { id: "support"   as const, label: "Support",  icon: MessageCircle,   component: SupportSection   },
    { id: "danger"    as const, label: "Danger",   icon: Trash2,          component: DangerSection    },
  ];

  const ActiveComponent = sections.find(s => s.id === activeSection)?.component ?? OverviewSection;
  const activeLabel = sections.find(s => s.id === activeSection)?.label ?? "";

  // Shared nav link renderer used in both sidebar and mobile drawer
  function NavLinks() {
    return (
      <>
        {sections.map((section) => {
          const isActive = activeSection === section.id;
          const isDanger = section.id === "danger";
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => navigateTo(section.id)}
              className="relative flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer"
              style={{
                background: isActive
                  ? isDanger
                    ? "linear-gradient(135deg, rgba(239,68,68,0.18) 0%, rgba(239,68,68,0.08) 100%)"
                    : "linear-gradient(135deg, rgba(22,169,123,0.20) 0%, rgba(22,169,123,0.08) 100%)"
                  : "transparent",
                color: isActive
                  ? isDanger ? "#f87171" : "#16A97B"
                  : isDanger ? "rgba(248,113,113,0.55)" : "var(--text-muted)",
                border: isActive
                  ? isDanger ? "1px solid rgba(239,68,68,0.25)" : "1px solid rgba(22,169,123,0.25)"
                  : "1px solid transparent",
                boxShadow: isActive
                  ? isDanger
                    ? "0 2px 12px rgba(239,68,68,0.10)"
                    : "0 2px 12px rgba(22,169,123,0.12), inset 0 1px 0 rgba(255,255,255,0.05)"
                  : "none",
              }}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                      style={{
                        background: isDanger
                          ? "linear-gradient(180deg, #f87171, rgba(239,68,68,0.3))"
                          : "linear-gradient(180deg, #16A97B, rgba(22,169,123,0.3))",
                        boxShadow: isDanger ? "0 0 8px rgba(239,68,68,0.5)" : "0 0 8px rgba(22,169,123,0.6)",
                      }} />
              )}
              <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-md transition-all duration-200"
                    style={{
                      background: isActive
                        ? isDanger ? "rgba(239,68,68,0.15)" : "rgba(22,169,123,0.15)"
                        : "transparent",
                    }}>
                <section.icon className="w-3.5 h-3.5" />
              </span>
              {section.label}
            </button>
          );
        })}
      </>
    );
  }

  return (
    <div className="flex min-h-screen transition-colors duration-300"
         style={{ background: "var(--bg-base)" }}>

      {/* Ambient sidebar glow */}
      <div className="pointer-events-none fixed top-0 left-0 w-60 h-full opacity-[0.03] blur-[80px] z-0"
           style={{ background: "radial-gradient(ellipse at 30% 40%, #16A97B 0%, transparent 70%)" }}
           aria-hidden />

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden md:flex flex-col w-60 shrink-0 fixed inset-y-0 left-0 z-30"
        style={{
          background: "linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(10,14,20,0.98) 100%)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          boxShadow: "4px 0 32px rgba(0,0,0,0.3), inset -1px 0 0 rgba(255,255,255,0.04)",
        }}
      >
        {/* Brand */}
        <div className="relative flex items-center gap-3 px-5 py-5 overflow-hidden"
             style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="absolute inset-0 opacity-20 pointer-events-none"
               style={{ background: "radial-gradient(ellipse at 0% 50%, rgba(22,169,123,0.3) 0%, transparent 70%)" }}
               aria-hidden />
          <div className="relative z-10 w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
               style={{ background: "rgba(22,169,123,0.15)", border: "1px solid rgba(22,169,123,0.3)" }}>
            <Shield className="w-3.5 h-3.5" style={{ color: "#16A97B" }} />
          </div>
          <div className="relative z-10 min-w-0">
            <p className="font-bold text-sm leading-none" style={{ color: "var(--text-primary)" }}>Admin Panel</p>
            <p className="text-[10px] mt-0.5 truncate" style={{ color: "rgba(100,116,139,0.7)" }}>NairaRails Internal</p>
          </div>
          <span className="relative z-10 ml-auto text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-md shrink-0"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
            ops
          </span>
        </div>

        <div className="px-5 pt-5 pb-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.18em]"
             style={{ color: "rgba(100,116,139,0.7)" }}>Navigation</p>
        </div>

        <nav className="flex-1 px-3 pb-4 space-y-0.5 overflow-y-auto" aria-label="Admin navigation">
          <NavLinks />
        </nav>

        <div className="mx-4 h-px"
             style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)" }} />

        <div className="px-3 py-4 space-y-1">
          <div className="flex items-center gap-2 mx-1 mb-2 px-3 py-2 rounded-xl"
               style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse"
                  style={{ background: "#ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.8)" }} />
            <span className="text-[10px] font-mono truncate" style={{ color: "rgba(100,116,139,0.8)" }}>
              admin session active
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSecret(null)}
            className="flex items-center gap-3 w-full text-left rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer"
            style={{ color: "var(--text-muted)", border: "1px solid transparent" }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(239,68,68,0.08)";
              e.currentTarget.style.borderColor = "rgba(239,68,68,0.20)";
              e.currentTarget.style.color = "#f87171";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
              e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            <span className="w-5 h-5 shrink-0 flex items-center justify-center rounded-md">
              <LogOut className="w-3.5 h-3.5" />
            </span>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Mobile nav drawer ── */}
      {mobileNavOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 md:hidden"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(3px)" }}
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          {/* Drawer panel */}
          <div
            className="fixed left-0 top-0 bottom-0 z-50 flex flex-col w-72 md:hidden"
            style={{
              background: "linear-gradient(180deg, rgba(15,23,42,0.99) 0%, rgba(10,14,20,0.99) 100%)",
              borderRight: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "8px 0 32px rgba(0,0,0,0.5)",
            }}
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4"
                 style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                     style={{ background: "rgba(22,169,123,0.15)", border: "1px solid rgba(22,169,123,0.3)" }}>
                  <Shield className="w-3.5 h-3.5" style={{ color: "#16A97B" }} />
                </div>
                <div>
                  <p className="font-bold text-sm leading-none" style={{ color: "var(--text-primary)" }}>Admin Panel</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "rgba(100,116,139,0.7)" }}>NairaRails Internal</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg cursor-pointer"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "var(--text-muted)" }}
                aria-label="Close navigation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" aria-label="Admin navigation">
              <NavLinks />
            </nav>

            {/* Drawer footer */}
            <div className="px-3 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                type="button"
                onClick={() => setSecret(null)}
                className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all cursor-pointer text-red-400"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 md:ml-60 min-h-screen pb-8">
        {/* Top bar — desktop shows section title + restricted badge; mobile shows hamburger */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 md:px-6 py-3"
             style={{
               background: "rgba(10,14,20,0.90)",
               backdropFilter: "blur(16px)",
               WebkitBackdropFilter: "blur(16px)",
               borderBottom: "1px solid rgba(255,255,255,0.06)",
             }}>
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "var(--text-secondary)" }}
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <h1 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>{activeLabel}</h1>
              <p className="text-[10px] hidden sm:block" style={{ color: "var(--text-muted)" }}>NairaRails Admin · Internal Ops</p>
            </div>
          </div>
          <span className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}>
            Restricted
          </span>
        </div>

        <div className="p-4 md:p-6 max-w-6xl">
          <ActiveComponent secret={secret} />
        </div>
      </main>
    </div>
  );
}
