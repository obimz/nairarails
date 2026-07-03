/**
 * OnboardingPage.tsx — merchant signup / API-key issuance
 *
 * Redesigned with glassmorphism, theme-aware CSS variables, and modern
 * two-column layout on desktop.  Preserves all existing API logic exactly.
 */

import React from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ArrowRight, Copy, Check, AlertCircle, Zap, Shield,
  RefreshCw, ChevronRight,
} from "lucide-react";
import { apiPost } from "../lib/apiFetch.js";
import { ThemeToggle } from "../components/ThemeToggle.js";

interface SignupResponse {
  merchantId: string;
  name:       string;
  apiKey:     string;
  message:    string;
}
type FormState = "idle" | "submitting" | "success" | "error";

// ── Feature bullets shown on left panel ──────────────────────────────────────
const FEATURES = [
  {
    icon: Zap,
    title: "One API call to integrate",
    desc: "Drop into your existing checkout with a single POST — no checkout flow changes.",
  },
  {
    icon: Shield,
    title: "HMAC-secured webhooks",
    desc: "Every inbound event verified with timing-safe SHA-256 before processing.",
  },
  {
    icon: RefreshCw,
    title: "Instant split-settlement",
    desc: "Seller, platform, rider — all paid in the same cycle the webhook fires.",
  },
];

// ── Success state ─────────────────────────────────────────────────────────────
function SuccessScreen({
  apiKey,
  onCopy,
  copied,
  onNavigate,
}: {
  apiKey: string;
  onCopy: () => void;
  copied: boolean;
  onNavigate: () => void;
}) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 auth-bg transition-colors duration-300"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-full max-w-lg">
        <div className="card-dark p-8 sm:p-10">

          {/* Header */}
          <div className="flex items-start gap-4 mb-8">
            <div className="flex-shrink-0 w-12 h-12 rounded-2xl bg-[#16A97B]/15 border border-[#16A97B]/30 flex items-center justify-center">
              <Check className="w-6 h-6 text-[#16A97B]" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display" style={{ color: "var(--text-primary)" }}>
                You're in.
              </h1>
              <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
                Your API key has been generated — copy it now.
              </p>
            </div>
          </div>

          {/* Warning banner */}
          <div
            className="flex gap-3 rounded-xl px-4 py-3 mb-6 text-sm"
            style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p style={{ color: "var(--text-secondary)" }}>
              <strong className="text-amber-400">This is the only time your key will be shown.</strong>{" "}
              Store it securely — we cannot recover it.
            </p>
          </div>

          {/* Key display */}
          <div className="rounded-xl overflow-hidden mb-8" style={{ border: "1px solid var(--border)" }}>
            <div
              className="flex items-center justify-between px-3 py-1.5"
              style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}
            >
              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                x-api-key
              </span>
              <button
                type="button"
                onClick={onCopy}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer"
                style={{
                  background: copied ? "rgba(22,169,123,0.15)" : "var(--bg-glass)",
                  color: copied ? "#16A97B" : "var(--text-secondary)",
                  border: "1px solid var(--border)",
                }}
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="px-4 py-3" style={{ background: "var(--bg-base)" }}>
              <code className="text-sm font-mono text-[#16A97B] break-all select-all">
                {apiKey}
              </code>
            </div>
          </div>

          <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
            Redirecting to dashboard in 5 seconds…
          </p>

          <button
            type="button"
            onClick={onNavigate}
            className="btn-primary w-full justify-center gap-2 py-3.5 text-base"
          >
            Go to Dashboard
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function OnboardingPage() {
  const navigate = useNavigate();

  const [name,        setName]        = React.useState("");
  const [email,       setEmail]       = React.useState("");
  const [webhookUrl,  setWebhook]     = React.useState("");
  const [formState,   setFormState]   = React.useState<FormState>("idle");
  const [errorMsg,    setErrorMsg]    = React.useState("");
  const [apiKey,      setApiKey]      = React.useState("");
  const [copied,      setCopied]      = React.useState(false);

  React.useEffect(() => {
    if (formState !== "success") return;
    const t = setTimeout(() => navigate("/dashboard/overview"), 5000);
    return () => clearTimeout(t);
  }, [formState, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("submitting");
    setErrorMsg("");
    try {
      const data = await apiPost<SignupResponse>("/api/v1/merchants/signup", {
        name,
        email,
        ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
      });
      localStorage.setItem("nairarails_api_key", data.apiKey);
      setApiKey(data.apiKey);
      setFormState("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setErrorMsg(
        msg.toLowerCase().includes("already registered")
          ? "This email is already registered."
          : msg
      );
      setFormState("error");
    }
  }

  async function handleCopy() {
    try { await navigator.clipboard.writeText(apiKey); } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (formState === "success") {
    return (
      <SuccessScreen
        apiKey={apiKey}
        onCopy={handleCopy}
        copied={copied}
        onNavigate={() => navigate("/dashboard/overview")}
      />
    );
  }

  return (
    <div
      className="min-h-screen auth-bg transition-colors duration-300"
      style={{ background: "var(--bg-base)" }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-6 py-4 backdrop-blur-sm"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#16A97B] flex items-center justify-center">
            <span className="text-black text-xs font-bold">₦</span>
          </div>
          <span className="font-bold font-display text-sm" style={{ color: "var(--text-primary)" }}>NairaRails</span>
        </div>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link
            to="/login"
            className="text-sm font-medium transition-colors duration-200 cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-brand)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            Sign in
          </Link>
        </div>
      </div>

      <div className="flex min-h-[calc(100vh-61px)]">

        {/* ── Left panel — feature highlights ─────────────────────────────────── */}
        <aside className="hidden lg:flex flex-col justify-center w-[480px] xl:w-[520px] shrink-0 px-12 xl:px-16 py-16"
          style={{ borderRight: "1px solid var(--border)" }}
        >
          {/* Brand */}
          <div className="mb-10">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono mb-6"
              style={{ background: "rgba(22,169,123,0.10)", border: "1px solid rgba(22,169,123,0.25)", color: "#16A97B" }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A97B] animate-pulse" />
              Nomba × DevCareer Hackathon 2026
            </div>
            <h2 className="text-3xl xl:text-4xl font-bold font-display leading-tight mb-4"
                style={{ color: "var(--text-primary)" }}>
              Programmable payment infrastructure for Nigerian marketplaces
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Every order gets its own bank account. Every naira is traced, matched, and split — automatically.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-4">
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center mt-0.5"
                  style={{ background: "rgba(22,169,123,0.10)", border: "1px solid rgba(22,169,123,0.20)" }}
                >
                  <Icon className="w-5 h-5 text-[#16A97B]" />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{title}</p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Stat strip */}
          <div
            className="mt-10 grid grid-cols-3 gap-4 rounded-2xl p-5"
            style={{ background: "var(--bg-glass)", border: "1px solid var(--border)" }}
          >
            {[
              { val: "₦35.56B", label: "Lost to reconciliation failures (2023–24)" },
              { val: "1 call",   label: "To integrate NairaRails" },
              { val: "< 1s",    label: "Settlement latency" },
            ].map(({ val, label }) => (
              <div key={val} className="text-center">
                <div className="text-lg font-bold font-mono text-[#16A97B]">{val}</div>
                <div className="text-[10px] mt-0.5 leading-tight" style={{ color: "var(--text-muted)" }}>{label}</div>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Right panel — signup form ────────────────────────────────────────── */}
        <main className="flex-1 flex items-center justify-center px-4 sm:px-8 py-16">
          <div className="w-full max-w-md">
            <div className="mb-8">
              <h1 className="text-2xl sm:text-3xl font-bold font-display mb-2" style={{ color: "var(--text-primary)" }}>
                Get API Access
              </h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                One signup. One key. Full payment infrastructure.
              </p>
            </div>

            <div className="card-dark p-8">
              <form onSubmit={handleSubmit} noValidate>
                <div className="space-y-5">

                  {/* Marketplace name */}
                  <div>
                    <label htmlFor="name" className="block text-sm font-medium mb-1.5"
                           style={{ color: "var(--text-secondary)" }}>
                      Marketplace name <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="name" type="text" required autoComplete="organization"
                      placeholder="e.g. Jumia Foods"
                      value={name} onChange={e => setName(e.target.value)}
                      className="input-dark"
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium mb-1.5"
                           style={{ color: "var(--text-secondary)" }}>
                      Email address <span className="text-red-400">*</span>
                    </label>
                    <input
                      id="email" type="email" required autoComplete="email"
                      placeholder="dev@yourmarketplace.ng"
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="input-dark"
                    />
                  </div>

                  {/* Webhook URL */}
                  <div>
                    <label htmlFor="webhook" className="block text-sm font-medium mb-1.5"
                           style={{ color: "var(--text-secondary)" }}>
                      Webhook URL{" "}
                      <span className="text-xs font-normal" style={{ color: "var(--text-muted)" }}>(optional)</span>
                    </label>
                    <input
                      id="webhook" type="url" autoComplete="url"
                      placeholder="https://yourapp.ng/webhooks/nairarails"
                      value={webhookUrl} onChange={e => setWebhook(e.target.value)}
                      className="input-dark"
                    />
                    <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      We'll POST a{" "}
                      <code className="font-mono text-[#16A97B]">payment.classified</code>{" "}
                      event here when each payment is processed.
                    </p>
                  </div>

                  {/* Error */}
                  {formState === "error" && (
                    <div
                      role="alert"
                      className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm text-red-400"
                      style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      {errorMsg}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={formState === "submitting" || !name.trim() || !email.trim()}
                    className="btn-primary w-full justify-center gap-2 py-3.5 text-base"
                  >
                    {formState === "submitting" ? (
                      <>
                        <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                        Creating your account…
                      </>
                    ) : (
                      <>
                        Get my API key
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div
                className="mt-6 pt-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
                style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                <span>Already have a key?</span>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1 font-medium text-[#16A97B] hover:text-[#128a64] transition-colors cursor-pointer"
                >
                  Sign in to dashboard <ChevronRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <p className="text-center text-xs mt-6" style={{ color: "var(--text-muted)" }}>
              By signing up you agree to use this key responsibly.
              API keys are shown once and not recoverable.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
