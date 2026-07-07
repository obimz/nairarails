/**
 * SettingsPage.tsx — merchant account settings.
 *
 * Three sections:
 *   1. Account — name, email, verified status, joined date
 *   2. API Key  — issue (if none), view prefix + dates, rotate, revoke
 *   3. Webhooks — view / update webhook URL
 */

import React from "react";
import {
  User, Key, Webhook, Copy, Check, RefreshCw, Trash2,
  AlertTriangle, ShieldCheck, ShieldOff, Eye, EyeOff, Save,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiGet, apiPost } from "../lib/apiFetch.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MerchantProfile {
  merchantId:    string;
  name:          string;
  email:         string;
  webhookUrl:    string | null;
  emailVerified: boolean;
  keyPrefix:     string | null;
  keyIssuedAt:   string | null;
  keyExpiresAt:  string | null;
  createdAt:     string;
}

interface KeyInfo {
  active:    boolean;
  prefix:    string | null;
  issuedAt:  string | null;
  expiresAt: string | null;
}

interface IssueKeyResponse {
  apiKey:    string;
  prefix:    string;
  issuedAt:  string;
  expiresAt: string | null;
  message:   string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function SectionHeading({ icon: Icon, title, subtitle }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="w-8 h-8 shrink-0 flex items-center justify-center mt-0.5"
           style={{ background: "rgba(22,169,123,0.10)", border: "1px solid rgba(22,169,123,0.20)" }}>
        <Icon className="w-4 h-4 text-[#16A97B]" />
      </div>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {subtitle && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3"
         style={{ borderBottom: "1px solid var(--border)" }}>
      <span className="text-xs font-medium uppercase tracking-widest"
            style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-sm font-mono" style={{ color: "var(--text-primary)" }}>{value}</span>
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <button type="button" onClick={copy}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer"
            style={{
              background: copied ? "rgba(22,169,123,0.12)" : "var(--bg-surface)",
              border:     "1px solid var(--border)",
              color:      copied ? "#16A97B" : "var(--text-muted)",
            }}>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

// ─── Confirm modal ────────────────────────────────────────────────────────────

function ConfirmModal({ title, body, confirmLabel, danger, onConfirm, onCancel }: {
  title:        string;
  body:         string;
  confirmLabel: string;
  danger?:      boolean;
  onConfirm:    () => void;
  onCancel:     () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
         style={{ background: "rgba(0,0,0,0.6)" }}
         onClick={onCancel}>
      <div className="w-full max-w-sm p-6"
           style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}
           onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{title}</h3>
        <p className="text-sm mb-6" style={{ color: "var(--text-secondary)" }}>{body}</p>
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onCancel}
                  className="px-4 py-2 text-xs font-medium cursor-pointer transition-colors"
                  style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
                  className="px-4 py-2 text-xs font-semibold cursor-pointer transition-colors text-white"
                  style={{ background: danger ? "#ef4444" : "#16A97B" }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection({ profile, onSaved }: { profile: MerchantProfile; onSaved: () => void }) {
  const [name,    setName]    = React.useState(profile.name);
  const [dirty,   setDirty]   = React.useState(false);
  const [saving,  setSaving]  = React.useState(false);
  const [saved,   setSaved]   = React.useState(false);
  const [error,   setError]   = React.useState("");

  function handleNameChange(v: string) {
    setName(v);
    setDirty(v.trim() !== profile.name);
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/v1/merchants/profile", {
        method: "PATCH",
        body:   JSON.stringify({ name: name.trim() }),
      });
      setSaved(true);
      setDirty(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-10">
      <SectionHeading icon={User} title="Account"
                      subtitle="Your merchant identity on NairaRails." />

      <form onSubmit={handleSave}>
        {/* Name field */}
        <div className="mb-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <label htmlFor="settings-name"
                 className="block text-[10px] font-semibold uppercase tracking-widest pt-4 pb-1"
                 style={{ color: "var(--text-muted)" }}>
            Marketplace name
          </label>
          <div className="flex items-center gap-3 pb-3">
            <input
              id="settings-name"
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: "var(--text-primary)", caretColor: "#16A97B" }}
            />
            {dirty && (
              <button type="submit" disabled={saving}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold cursor-pointer disabled:opacity-50"
                      style={{ background: "#16A97B", color: "#000" }}>
                {saving
                  ? <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  : <Save className="w-3 h-3" />}
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            {saved && !dirty && (
              <span className="inline-flex items-center gap-1 text-xs text-[#16A97B]">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
        </div>

        {error && (
          <p className="mb-4 text-xs text-red-400" style={{ borderLeft: "2px solid #f87171", paddingLeft: "8px" }}>
            {error}
          </p>
        )}
      </form>

      {/* Read-only fields */}
      <Row label="Email" value={profile.email} />
      <Row label="Email verified" value={
        profile.emailVerified
          ? <span className="inline-flex items-center gap-1 text-[#16A97B]"><ShieldCheck className="w-3.5 h-3.5" /> Verified</span>
          : <span className="inline-flex items-center gap-1 text-yellow-400"><ShieldOff className="w-3.5 h-3.5" /> Not verified</span>
      } />
      <Row label="Member since" value={fmtDate(profile.createdAt)} />
      <Row label="Merchant ID"  value={
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-xs" style={{ color: "var(--text-muted)" }}>
            {profile.merchantId.slice(0, 16)}…
          </span>
          <CopyButton text={profile.merchantId} />
        </span>
      } />
    </section>
  );
}

// ─── API Key section ──────────────────────────────────────────────────────────

function ApiKeySection({ profile }: { profile: MerchantProfile }) {
  const qc = useQueryClient();

  // Live key status (prefix + dates — never the raw key)
  const { data: keyInfo, isLoading: keyLoading } = useQuery<KeyInfo>({
    queryKey: ["merchant-key"],
    queryFn:  () => apiGet<KeyInfo>("/api/v1/merchants/keys"),
  });

  // Freshly issued / rotated key — shown once
  const [revealedKey, setRevealedKey]   = React.useState<string | null>(null);
  const [showKey,     setShowKey]       = React.useState(false);
  const [confirm,     setConfirm]       = React.useState<"rotate" | "revoke" | null>(null);
  const [actionError, setActionError]   = React.useState("");

  const issueMutation = useMutation({
    mutationFn: () => apiPost<IssueKeyResponse>("/api/v1/merchants/keys/issue"),
    onSuccess: (data) => {
      setRevealedKey(data.apiKey);
      setShowKey(false);
      setActionError("");
      qc.invalidateQueries({ queryKey: ["merchant-key"] });
      qc.invalidateQueries({ queryKey: ["merchant-profile"] });
      // Also persist to localStorage so the dashboard API calls work immediately
      localStorage.setItem("nairarails_api_key", data.apiKey);
    },
    onError: (err: Error) => setActionError(err.message),
  });

  const rotateMutation = useMutation({
    mutationFn: () => apiPost<IssueKeyResponse>("/api/v1/merchants/keys/rotate"),
    onSuccess: (data) => {
      setRevealedKey(data.apiKey);
      setShowKey(false);
      setActionError("");
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["merchant-key"] });
      localStorage.setItem("nairarails_api_key", data.apiKey);
    },
    onError: (err: Error) => { setActionError(err.message); setConfirm(null); },
  });

  const revokeMutation = useMutation({
    mutationFn: () => apiPost<{ message: string }>("/api/v1/merchants/keys/revoke"),
    onSuccess: () => {
      setRevealedKey(null);
      setActionError("");
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["merchant-key"] });
      localStorage.removeItem("nairarails_api_key");
    },
    onError: (err: Error) => { setActionError(err.message); setConfirm(null); },
  });

  const busy = issueMutation.isPending || rotateMutation.isPending || revokeMutation.isPending;

  return (
    <section className="mb-10">
      <SectionHeading icon={Key} title="API Key"
                      subtitle="Your credential for all programmatic API calls. Shown once — copy it immediately." />

      {keyLoading ? (
        <div className="py-4 flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
          <div className="w-4 h-4 border-2 border-slate-600 border-t-[#16A97B] rounded-full animate-spin" />
          <span className="text-xs">Loading…</span>
        </div>
      ) : !profile.emailVerified ? (
        /* Email not yet verified */
        <div className="flex items-start gap-3 p-4"
             style={{ background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.25)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-yellow-400" />
          <div>
            <p className="text-xs font-medium text-yellow-300">Email not verified</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Click the verification link in your signup email before issuing an API key.
            </p>
          </div>
        </div>
      ) : !keyInfo?.active ? (
        /* No key yet — issue first key */
        <div>
          <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
            No API key issued yet. Issue one to start integrating.
          </p>
          {actionError && (
            <p className="mb-3 text-xs text-red-400" style={{ borderLeft: "2px solid #f87171", paddingLeft: "8px" }}>
              {actionError}
            </p>
          )}
          <button type="button" disabled={busy} onClick={() => issueMutation.mutate()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-black cursor-pointer disabled:opacity-50"
                  style={{ background: "#16A97B", boxShadow: "0 4px 20px rgba(22,169,123,0.25)" }}>
            {busy
              ? <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              : <Key className="w-4 h-4" />}
            {busy ? "Issuing…" : "Issue API key"}
          </button>
        </div>
      ) : (
        /* Active key */
        <div>
          <Row label="Key prefix"  value={
            <span className="font-mono text-xs">{keyInfo.prefix}…</span>
          } />
          <Row label="Issued"      value={fmtDate(keyInfo.issuedAt)} />
          <Row label="Expires"     value={keyInfo.expiresAt ? fmtDate(keyInfo.expiresAt) : "Never"} />
          <Row label="Status"      value={
            <span className="inline-flex items-center gap-1 text-[#16A97B]">
              <ShieldCheck className="w-3.5 h-3.5" /> Active
            </span>
          } />

          <div className="flex items-center gap-3 mt-6">
            <button type="button" disabled={busy} onClick={() => setConfirm("rotate")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
                    style={{ border: "1px solid var(--border)", color: "var(--text-primary)" }}>
              <RefreshCw className="w-3.5 h-3.5" />
              Rotate key
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirm("revoke")}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors text-red-400"
                    style={{ border: "1px solid rgba(239,68,68,0.3)" }}>
              <Trash2 className="w-3.5 h-3.5" />
              Revoke key
            </button>
          </div>

          {actionError && (
            <p className="mt-3 text-xs text-red-400" style={{ borderLeft: "2px solid #f87171", paddingLeft: "8px" }}>
              {actionError}
            </p>
          )}
        </div>
      )}

      {/* Revealed key banner — shown after issue or rotate */}
      {revealedKey && (
        <div className="mt-6 p-4"
             style={{ background: "rgba(22,169,123,0.06)", border: "1px solid rgba(22,169,123,0.25)" }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-[#16A97B]">
              Your new API key — copy it now, it won't be shown again
            </p>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowKey(v => !v)}
                      className="cursor-pointer transition-colors"
                      style={{ color: "var(--text-muted)" }}
                      aria-label={showKey ? "Hide key" : "Show key"}>
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
              <CopyButton text={revealedKey} />
            </div>
          </div>
          <p className="font-mono text-xs break-all"
             style={{ color: showKey ? "var(--text-primary)" : "transparent",
                      textShadow: showKey ? "none" : "0 0 8px var(--text-primary)",
                      userSelect: showKey ? "text" : "none" }}>
            {revealedKey}
          </p>
          <p className="text-[10px] mt-3" style={{ color: "var(--text-muted)" }}>
            Use this as the <code className="font-mono">x-api-key</code> header on all order and exception API calls.
          </p>
        </div>
      )}

      {/* Confirm modals */}
      {confirm === "rotate" && (
        <ConfirmModal
          title="Rotate API key?"
          body="Your current key will be immediately invalidated. Any integrations using it will fail until you update them with the new key."
          confirmLabel="Rotate"
          onConfirm={() => rotateMutation.mutate()}
          onCancel={() => setConfirm(null)}
        />
      )}
      {confirm === "revoke" && (
        <ConfirmModal
          title="Revoke API key?"
          body="This permanently invalidates your key. All API calls will return 401 until you issue a new key. This cannot be undone."
          confirmLabel="Revoke"
          danger
          onConfirm={() => revokeMutation.mutate()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </section>
  );
}

// ─── Webhook section ──────────────────────────────────────────────────────────

function WebhookSection({ profile, onSaved }: { profile: MerchantProfile; onSaved: () => void }) {
  const [url,    setUrl]    = React.useState(profile.webhookUrl ?? "");
  const [dirty,  setDirty]  = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved,  setSaved]  = React.useState(false);
  const [error,  setError]  = React.useState("");

  function handleChange(v: string) {
    setUrl(v);
    setDirty(v.trim() !== (profile.webhookUrl ?? ""));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/v1/merchants/profile", {
        method: "PATCH",
        body:   JSON.stringify({ webhookUrl: url.trim() || null }),
      });
      setSaved(true);
      setDirty(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mb-10">
      <SectionHeading icon={Webhook} title="Webhook"
                      subtitle="NairaRails POSTs a payment.classified event here after every payment." />

      <form onSubmit={handleSave}>
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <label htmlFor="settings-webhook"
                 className="block text-[10px] font-semibold uppercase tracking-widest pt-4 pb-1"
                 style={{ color: "var(--text-muted)" }}>
            Webhook URL <span className="normal-case font-normal tracking-normal text-[10px]">(optional)</span>
          </label>
          <div className="flex items-center gap-3 pb-3">
            <input
              id="settings-webhook"
              type="url"
              placeholder="https://yourapp.ng/webhooks/nairarails"
              value={url}
              onChange={e => handleChange(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none font-mono"
              style={{ color: "var(--text-primary)", caretColor: "#16A97B" }}
            />
            {dirty && (
              <button type="submit" disabled={saving}
                      className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold cursor-pointer disabled:opacity-50"
                      style={{ background: "#16A97B", color: "#000" }}>
                {saving
                  ? <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  : <Save className="w-3 h-3" />}
                {saving ? "Saving…" : "Save"}
              </button>
            )}
            {saved && !dirty && (
              <span className="inline-flex items-center gap-1 text-xs text-[#16A97B]">
                <Check className="w-3 h-3" /> Saved
              </span>
            )}
          </div>
        </div>

        {error && (
          <p className="mt-3 text-xs text-red-400" style={{ borderLeft: "2px solid #f87171", paddingLeft: "8px" }}>
            {error}
          </p>
        )}
      </form>

      <div className="mt-4 p-4" style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
        <p className="text-xs font-medium mb-2" style={{ color: "var(--text-primary)" }}>
          Event payload shape
        </p>
        <pre className="text-[11px] leading-relaxed overflow-x-auto" style={{ color: "var(--text-muted)" }}>{`{
  "event": "payment.classified",
  "order_ref": "ord-001",
  "status": "paid" | "underpayment" | "overpayment",
  "received_amount_kobo": 500000,
  "expected_amount_kobo": 500000,
  "splits_executed": true,
  "timestamp": "2026-07-04T10:00:00Z"
}`}</pre>
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SettingsPage() {
  const qc = useQueryClient();

  const { data: profile, isLoading, isError } = useQuery<MerchantProfile>({
    queryKey: ["merchant-profile"],
    queryFn:  () => apiGet<MerchantProfile>("/api/v1/auth/me"),
  });

  function refetchProfile() {
    qc.invalidateQueries({ queryKey: ["merchant-profile"] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="w-5 h-5 border-2 border-slate-700 border-t-[#16A97B] rounded-full animate-spin" />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <p className="text-sm text-red-400">Failed to load profile. Refresh to try again.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 md:px-6 md:py-8 max-w-2xl">
      {/* Page header */}
      <div className="mb-10">
        <h1 className="text-lg font-bold font-display mb-1" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Manage your account, API key, and webhook configuration.
        </p>
      </div>

      <AccountSection profile={profile} onSaved={refetchProfile} />

      <div style={{ borderTop: "1px solid var(--border)" }} className="mb-10" />

      <ApiKeySection profile={profile} />

      <div style={{ borderTop: "1px solid var(--border)" }} className="mb-10" />

      <WebhookSection profile={profile} onSaved={refetchProfile} />
    </div>
  );
}
