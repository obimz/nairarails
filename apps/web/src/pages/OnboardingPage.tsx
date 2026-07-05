/**
 * OnboardingPage.tsx — merchant registration. Sharp, minimal, no rounded inputs.
 * Design: two-column on desktop (left = context, right = form), line-based fields.
 */

import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Check, AlertCircle, Zap, Shield, RefreshCw, Eye, EyeOff } from "lucide-react";
import { apiPost } from "../lib/apiFetch.js";
import { LogoLockup } from "../components/Logo.js";
import { ThemeToggle } from "../components/ThemeToggle.js";

type FormState = "idle" | "submitting" | "success" | "error";

const FEATURES = [
  { icon: Zap,        title: "One API call",        desc: "Drop a single POST into your checkout — no flow changes." },
  { icon: Shield,     title: "Auto-reconciliation",  desc: "Every payment classified and matched the moment it lands." },
  { icon: RefreshCw,  title: "Instant split",        desc: "Seller, platform, rider — paid in the same webhook cycle." },
];

// ─── Field component ──────────────────────────────────────────────────────────

function Field({
  id, label, type = "text", placeholder, value, onChange,
  autoComplete, required, suffix,
}: {
  id: string;
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  suffix?: React.ReactNode;
}) {
  return (
    <div className="relative" style={{ borderBottom: "1px solid var(--border)" }}>
      <label htmlFor={id}
             className="block text-[10px] font-semibold uppercase tracking-widest pt-4 pb-1"
             style={{ color: "var(--text-muted)" }}>
        {label}{required && <span className="ml-0.5 text-red-400">*</span>}
      </label>
      <input
        id={id} type={type} required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)}
        className="w-full pb-3 pt-1 text-sm bg-transparent outline-none"
        style={{
          color:      "var(--text-primary)",
          caretColor: "#16A97B",
          paddingRight: suffix ? "2.5rem" : undefined,
        }}
      />
      {suffix && (
        <div className="absolute right-0 bottom-3">{suffix}</div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OnboardingPage() {
  const navigate = useNavigate();

  const [name,       setName]       = React.useState("");
  const [email,      setEmail]      = React.useState("");
  const [password,   setPassword]   = React.useState("");
  const [showPass,   setShowPass]   = React.useState(false);
  const [webhookUrl, setWebhook]    = React.useState("");
  const [formState,  setFormState]  = React.useState<FormState>("idle");
  const [errorMsg,   setErrorMsg]   = React.useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormState("submitting");
    setErrorMsg("");
    try {
      await apiPost<{ merchantId: string; message: string }>("/api/v1/auth/register", {
        name,
        email,
        password,
        ...(webhookUrl.trim() ? { webhookUrl: webhookUrl.trim() } : {}),
      });
      setFormState("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setErrorMsg(
        msg.toLowerCase().includes("already registered")
          ? "This email is already registered — sign in instead."
          : msg
      );
      setFormState("error");
    }
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (formState === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6"
           style={{ background: "var(--bg-base)" }}>
        <div className="w-full max-w-sm">
          <div className="w-10 h-10 flex items-center justify-center mb-6"
               style={{ background: "rgba(22,169,123,0.12)", border: "1px solid rgba(22,169,123,0.30)" }}>
            <Check className="w-5 h-5 text-[#16A97B]" />
          </div>
          <h1 className="text-xl font-bold font-display mb-2"
              style={{ color: "var(--text-primary)" }}>
            Check your email
          </h1>
          <p className="text-sm mb-8 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            We sent a verification link to{" "}
            <span className="font-medium" style={{ color: "var(--text-primary)" }}>{email}</span>.
            Click it to verify your account, then sign in to get your API key.
          </p>
          <button type="button" onClick={() => navigate("/login")}
                  className="flex items-center gap-2 text-sm font-semibold cursor-pointer text-[#16A97B] hover:underline">
            Go to sign in <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-base)" }}>

      {/* ── Left panel ───────────────────────────────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[400px] xl:w-[460px] shrink-0 px-10 py-10"
        style={{ borderRight: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        <Link to="/"><LogoLockup size={28} textSize="text-sm" /></Link>

        <div className="space-y-10">
          {/* Headline */}
          <div>
            <p className="text-xs font-mono uppercase tracking-widest mb-4"
               style={{ color: "var(--text-muted)" }}>
              Payment infrastructure
            </p>
            <h2 className="text-2xl font-bold font-display leading-snug mb-3"
                style={{ color: "var(--text-primary)" }}>
              Every order gets its own bank account.
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              One API call at checkout. Payments matched, split, and settled automatically.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-6">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <div className="shrink-0 w-7 h-7 flex items-center justify-center mt-0.5"
                     style={{ background: "rgba(22,169,123,0.10)", border: "1px solid rgba(22,169,123,0.20)" }}>
                  <Icon className="w-3.5 h-3.5 text-[#16A97B]" />
                </div>
                <div>
                  <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>{title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-px"
               style={{ background: "var(--border)" }}>
            {[
              { val: "₦35.56B", label: "Lost to reconciliation failures" },
              { val: "1 call",  label: "To integrate" },
              { val: "< 1s",   label: "Settlement latency" },
            ].map(({ val, label }) => (
              <div key={val} className="px-3 py-4"
                   style={{ background: "var(--bg-surface)" }}>
                <div className="text-base font-bold font-mono text-[#16A97B]">{val}</div>
                <div className="text-[10px] mt-1 leading-tight" style={{ color: "var(--text-muted)" }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          © {new Date().getFullYear()} NairaRails
        </p>
      </div>

      {/* ── Right panel: form ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-5 lg:justify-end"
             style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="lg:hidden">
            <Link to="/"><LogoLockup size={26} textSize="text-sm" /></Link>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link to="/login"
                  className="text-xs font-medium transition-colors cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--text-primary)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}>
              Already registered? Sign in →
            </Link>
          </div>
        </div>

        {/* Form body */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">

            <div className="mb-8">
              <h1 className="text-xl font-bold font-display mb-1"
                  style={{ color: "var(--text-primary)" }}>
                Get API access
              </h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                One account. One key. Full payment infrastructure.
              </p>
            </div>

            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-0">
                <Field id="name"     label="Marketplace name" required
                       placeholder="e.g. Jumia Foods"
                       value={name}       onChange={setName}
                       autoComplete="organization" />

                <Field id="email"    label="Email address" type="email" required
                       placeholder="dev@yourmarketplace.ng"
                       value={email}      onChange={setEmail}
                       autoComplete="email" />

                <Field id="password" label="Password" type={showPass ? "text" : "password"} required
                       placeholder="At least 8 characters"
                       value={password}   onChange={setPassword}
                       autoComplete="new-password"
                       suffix={
                         <button type="button" onClick={() => setShowPass(v => !v)}
                                 aria-label={showPass ? "Hide" : "Show"}
                                 className="cursor-pointer transition-colors"
                                 style={{ color: "var(--text-muted)" }}>
                           {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                         </button>
                       } />

                <div style={{ borderBottom: "1px solid var(--border)" }}>
                  <label htmlFor="webhook"
                         className="block text-[10px] font-semibold uppercase tracking-widest pt-4 pb-1"
                         style={{ color: "var(--text-muted)" }}>
                    Webhook URL <span className="normal-case font-normal tracking-normal text-[10px]">(optional)</span>
                  </label>
                  <input id="webhook" type="url" autoComplete="url"
                         placeholder="https://yourapp.ng/webhooks/nairarails"
                         value={webhookUrl} onChange={e => setWebhook(e.target.value)}
                         className="w-full pb-3 pt-1 text-sm bg-transparent outline-none"
                         style={{ color: "var(--text-primary)", caretColor: "#16A97B" }} />
                </div>
              </div>

              {/* Error */}
              {formState === "error" && (
                <div role="alert"
                     className="mt-4 flex items-start gap-2 text-xs text-red-400"
                     style={{ borderLeft: "2px solid #f87171", paddingLeft: "8px" }}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {errorMsg}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={formState === "submitting" || !name.trim() || !email.trim() || password.length < 8}
                className="mt-8 w-full flex items-center justify-center gap-2 py-3 text-sm font-semibold text-black transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "#16A97B",
                  boxShadow: "0 4px 20px rgba(22,169,123,0.30)",
                }}
                onMouseEnter={e => { if (!e.currentTarget.disabled) e.currentTarget.style.background = "#128a64"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#16A97B"; }}
              >
                {formState === "submitting" ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Creating account…
                  </>
                ) : (
                  <>
                    Create account
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
              By registering you agree to use this key responsibly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
