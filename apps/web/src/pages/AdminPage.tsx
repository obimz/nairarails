/**
 * AdminPage — internal ops panel.
 *
 * Gated by ADMIN_SECRET (x-admin-secret header). The secret is held only in
 * component state for the session — never written to localStorage or the DOM.
 *
 * Panels:
 *   1. Bank Lookup      — verify any account number resolves before using it in splits
 *   2. Nuke             — wipe all orders + expire all VAs on Nomba
 *   3. Expire Pending   — bulk-mark pending orders expired + expire their VAs
 *   4. Reset Order      — reset one order back to pending (for buggy webhooks)
 *   5. Reconcile Check  — diff Nomba transactions vs local ledger for a date range
 */

import { useState } from "react";
import { LogoMark } from "../components/Logo.js";
import {
  Search, Trash2, Clock, RotateCcw, GitCompare,
  LogOut, ChevronDown, ChevronUp, AlertTriangle, CheckCircle,
} from "lucide-react";
import { adminFetch } from "../lib/apiFetch.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PanelResult {
  ok:   boolean;
  data: unknown;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ResultBox({ result }: { result: PanelResult | null }) {
  if (!result) return null;
  return (
    <div
      className={`mt-4 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap break-all border ${
        result.ok
          ? "bg-green-500/10 border-green-500/30 text-green-300"
          : "bg-red-500/10  border-red-500/30  text-red-300"
      }`}
    >
      {result.ok
        ? <CheckCircle className="inline w-3.5 h-3.5 mr-1.5 mb-0.5" />
        : <AlertTriangle className="inline w-3.5 h-3.5 mr-1.5 mb-0.5" />}
      {JSON.stringify(result.data, null, 2)}
    </div>
  );
}

function PanelCard({
  title, icon, children, danger,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div
      className="rounded-xl border"
      style={{
        background:   "var(--bg-surface)",
        borderColor:  danger ? "rgba(239,68,68,0.3)" : "var(--border)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <span className={danger ? "text-red-400" : "text-[#16A97B]"}>{icon}</span>
          <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
            {title}
          </span>
        </div>
        {open
          ? <ChevronUp className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
          : <ChevronDown className="w-4 h-4" style={{ color: "var(--text-muted)" }} />}
      </button>
      {open && (
        <div className="px-5 pb-5" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

function Input({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
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
        className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none transition-colors"
        style={{
          background:  "var(--bg-base)",
          border:      "1px solid var(--border)",
          color:       "var(--text-primary)",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
        onBlur={(e)  => (e.currentTarget.style.borderColor = "var(--border)")}
      />
    </label>
  );
}

function Btn({
  children, onClick, loading, danger, disabled,
}: {
  children: React.ReactNode; onClick: () => void;
  loading?: boolean; danger?: boolean; disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading || disabled}
      className={`mt-4 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        danger
          ? "bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
          : "bg-[#16A97B]/20 text-[#16A97B] border border-[#16A97B]/30 hover:bg-[#16A97B]/30"
      }`}
    >
      {loading && (
        <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function AdminLogin({ onAuth }: { onAuth: (secret: string) => void }) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!input.trim()) { setError("Enter your admin secret"); return; }
    setLoading(true);
    setError("");
    try {
      // Probe a cheap endpoint to verify the secret before entering the panel.
      await adminFetch("GET", "/api/v1/admin/banks", input.trim());
      onAuth(input.trim());
    } catch (err: unknown) {
      // 401 = wrong secret. Anything else (500, network) = secret is fine,
      // let them in anyway — the panel will show errors per-action.
      const is401 = err instanceof Error && "status" in err && (err as { status: number }).status === 401;
      if (is401) {
        setError("Invalid secret — check ADMIN_SECRET in your environment");
      } else {
        // Secret accepted but banks endpoint failed (Nomba error etc.) — still unlock
        onAuth(input.trim());
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm rounded-2xl p-8 border"
           style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <div className="flex items-center gap-2.5 mb-6">
          <LogoMark size={32} />
          <div>
            <p className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>NairaRails</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Admin Panel</p>
          </div>
        </div>

        <label className="block mb-4">
          <span className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Admin Secret
          </span>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void submit()}
            placeholder="••••••••••••"
            className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none"
            style={{
              background: "var(--bg-base)",
              border:     "1px solid var(--border)",
              color:      "var(--text-primary)",
            }}
          />
        </label>

        {error && (
          <p className="text-xs text-red-400 mb-3 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
          </p>
        )}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-semibold bg-[#16A97B] text-black hover:bg-[#13936b] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading && (
            <span className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          )}
          Unlock Admin Panel
        </button>
      </div>
    </div>
  );
}

// ─── Panel: Bank Lookup ───────────────────────────────────────────────────────

function BankLookupPanel({ secret }: { secret: string }) {
  const [bankCode, setBankCode]     = useState("");
  const [accountNo, setAccountNo]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<PanelResult | null>(null);

  async function run() {
    setLoading(true); setResult(null);
    try {
      const data = await adminFetch("POST", "/api/v1/admin/test-lookup", secret, {
        bankCode, accountNumber: accountNo,
      });
      setResult({ ok: true, data });
    } catch (e) {
      setResult({ ok: false, data: String(e) });
    } finally { setLoading(false); }
  }

  return (
    <PanelCard title="Bank Account Lookup" icon={<Search className="w-4 h-4" />}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Bank Code" value={bankCode} onChange={setBankCode} placeholder="058" />
        <Input label="Account Number" value={accountNo} onChange={setAccountNo} placeholder="0123456789" />
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
        Verify an account resolves on Nomba before using it as a split recipient.
      </p>
      <Btn onClick={() => void run()} loading={loading} disabled={!bankCode || !accountNo}>
        <Search className="w-3.5 h-3.5" /> Lookup
      </Btn>
      <ResultBox result={result} />
    </PanelCard>
  );
}

// ─── Panel: Nuke ─────────────────────────────────────────────────────────────

function NukePanel({ secret }: { secret: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<PanelResult | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function run() {
    setLoading(true); setResult(null); setConfirm(false);
    try {
      const data = await adminFetch("POST", "/api/v1/admin/nuke", secret);
      setResult({ ok: true, data });
    } catch (e) {
      setResult({ ok: false, data: String(e) });
    } finally { setLoading(false); }
  }

  return (
    <PanelCard title="Nuke All Orders" icon={<Trash2 className="w-4 h-4" />} danger>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        Deletes <strong>all</strong> orders, splits, ledger entries, and webhook events from the local
        database. Also expires all virtual accounts on Nomba. Merchants are not affected.
      </p>
      {!confirm ? (
        <Btn danger onClick={() => setConfirm(true)}>
          <Trash2 className="w-3.5 h-3.5" /> Nuke Everything
        </Btn>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <Btn danger onClick={() => void run()} loading={loading}>
            <AlertTriangle className="w-3.5 h-3.5" /> Confirm — this cannot be undone
          </Btn>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
        </div>
      )}
      <ResultBox result={result} />
    </PanelCard>
  );
}

// ─── Panel: Expire Pending ────────────────────────────────────────────────────

function ExpirePendingPanel({ secret }: { secret: string }) {
  const [refs, setRefs]       = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<PanelResult | null>(null);

  async function run() {
    setLoading(true); setResult(null);
    try {
      const order_refs = refs.trim()
        ? refs.split(",").map((r) => r.trim()).filter(Boolean)
        : undefined;
      const data = await adminFetch("POST", "/api/v1/admin/orders/expire-pending", secret,
        order_refs ? { order_refs } : undefined
      );
      setResult({ ok: true, data });
    } catch (e) {
      setResult({ ok: false, data: String(e) });
    } finally { setLoading(false); }
  }

  return (
    <PanelCard title="Expire Pending Orders" icon={<Clock className="w-4 h-4" />}>
      <Input
        label="Order Refs (optional — comma separated)"
        value={refs}
        onChange={setRefs}
        placeholder="ord-001, ord-002  — leave blank to expire ALL pending"
      />
      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
        Marks matching pending orders as <code>expired</code> and expires their virtual accounts on Nomba.
        Leave blank to expire every pending order.
      </p>
      <Btn onClick={() => void run()} loading={loading}>
        <Clock className="w-3.5 h-3.5" /> Expire
      </Btn>
      <ResultBox result={result} />
    </PanelCard>
  );
}

// ─── Panel: Reset Order ───────────────────────────────────────────────────────

function ResetOrderPanel({ secret }: { secret: string }) {
  const [orderRef, setOrderRef] = useState("");
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<PanelResult | null>(null);

  async function run() {
    setLoading(true); setResult(null);
    try {
      const data = await adminFetch("POST", `/api/v1/admin/orders/${encodeURIComponent(orderRef)}/reset`, secret);
      setResult({ ok: true, data });
    } catch (e) {
      setResult({ ok: false, data: String(e) });
    } finally { setLoading(false); }
  }

  return (
    <PanelCard title="Reset Single Order" icon={<RotateCcw className="w-4 h-4" />}>
      <Input
        label="Order Ref"
        value={orderRef}
        onChange={setOrderRef}
        placeholder="ord-001"
      />
      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
        Resets a misclassified order back to <code>pending</code>, clears ledger entries and splits,
        removes the webhook event (so the same requestId can be re-processed), and expires the VA on Nomba.
      </p>
      <Btn onClick={() => void run()} loading={loading} disabled={!orderRef.trim()}>
        <RotateCcw className="w-3.5 h-3.5" /> Reset Order
      </Btn>
      <ResultBox result={result} />
    </PanelCard>
  );
}

// ─── Panel: Reconcile Check ───────────────────────────────────────────────────

function ReconcilePanel({ secret }: { secret: string }) {
  const today = new Date().toISOString().split("T")[0] as string;
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo]     = useState(today);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState<PanelResult | null>(null);

  async function run() {
    setLoading(true); setResult(null);
    try {
      const data = await adminFetch(
        "GET",
        `/api/v1/admin/reconcile-check?date_from=${dateFrom}&date_to=${dateTo}`,
        secret
      );
      setResult({ ok: true, data });
    } catch (e) {
      setResult({ ok: false, data: String(e) });
    } finally { setLoading(false); }
  }

  return (
    <PanelCard title="Reconcile Check" icon={<GitCompare className="w-4 h-4" />}>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Date From" value={dateFrom} onChange={setDateFrom} type="date" />
        <Input label="Date To"   value={dateTo}   onChange={setDateTo}   type="date" />
      </div>
      <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
        Diffs Nomba's transaction list against your local ledger. Surfaces orphans (on Nomba but
        missing locally) and drift (amount mismatch).
      </p>
      <Btn onClick={() => void run()} loading={loading}>
        <GitCompare className="w-3.5 h-3.5" /> Run Check
      </Btn>
      <ResultBox result={result} />
    </PanelCard>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AdminPage() {
  const [secret, setSecret] = useState<string | null>(null);

  if (!secret) {
    return <AdminLogin onAuth={setSecret} />;
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Header */}
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-6 py-4"
        style={{ background: "var(--bg-surface)", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2.5">
          <LogoMark size={28} />
          <div>
            <span className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>NairaRails</span>
            <span
              className="ml-2 text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-base)", color: "var(--text-muted)" }}
            >
              admin
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSecret(null)}
          className="flex items-center gap-1.5 text-xs hover:text-red-400 transition-colors"
          style={{ color: "var(--text-muted)" }}
        >
          <LogOut className="w-3.5 h-3.5" /> Lock
        </button>
      </header>

      {/* Panels */}
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
        <BankLookupPanel   secret={secret} />
        <ReconcilePanel    secret={secret} />
        <ExpirePendingPanel secret={secret} />
        <ResetOrderPanel   secret={secret} />
        <NukePanel         secret={secret} />
      </div>
    </div>
  );
}
