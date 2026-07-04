/**
 * LoginPage.tsx — sharp, minimal sign-in. No rounded inputs.
 * Design: editorial left-aligned, strong hierarchy, line-based fields.
 */

import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { LogoLockup } from "../components/Logo.js";
import { ThemeToggle } from "../components/ThemeToggle.js";

type FormState = "idle" | "submitting" | "error";

export function LoginPage() {
  const navigate = useNavigate();

  const [email,     setEmail]     = React.useState("");
  const [password,  setPassword]  = React.useState("");
  const [showPass,  setShowPass]  = React.useState(false);
  const [formState, setFormState] = React.useState<FormState>("idle");
  const [errorMsg,  setErrorMsg]  = React.useState("");

  const legacyKey = React.useMemo(() => {
    try { return localStorage.getItem("nairarails_api_key") ?? ""; } catch { return ""; }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setFormState("submitting");
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setErrorMsg(error.message ?? "Invalid email or password.");
      setFormState("error");
      return;
    }
    navigate("/dashboard/overview");
  }

  return (
    <div className="min-h-screen flex" style={{ background: "var(--bg-base)" }}>

      {/* ── Left: branding strip (desktop only) ─────────────────────────────── */}
      <div
        className="hidden lg:flex flex-col justify-between w-80 xl:w-96 shrink-0 px-10 py-10"
        style={{ borderRight: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        <Link to="/"><LogoLockup size={28} textSize="text-sm" /></Link>

        <div>
          <p className="text-xs font-mono uppercase tracking-widest mb-4"
             style={{ color: "var(--text-muted)" }}>
            Infrastructure layer
          </p>
          <p className="text-2xl font-bold font-display leading-snug"
             style={{ color: "var(--text-primary)" }}>
            Every naira has an address.
          </p>
          <p className="text-2xl font-bold font-display leading-snug"
             style={{ color: "var(--text-muted)" }}>
            Every settlement has a rule.
          </p>
        </div>

        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          © {new Date().getFullYear()} NairaRails
        </p>
      </div>

      {/* ── Right: form ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col">

        {/* Top bar (mobile logo + nav) */}
        <div className="flex items-center justify-between px-6 py-5"
             style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="lg:hidden">
            <Link to="/"><LogoLockup size={26} textSize="text-sm" /></Link>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <ThemeToggle />
            <Link to="/signup"
                  className="text-xs font-medium transition-colors cursor-pointer"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={e => (e.currentTarget.style.color = "var(--text-primary)")}
                  onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}>
              Create account →
            </Link>
          </div>
        </div>

        {/* Centred form body */}
        <div className="flex-1 flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-sm">

            {/* Heading */}
            <div className="mb-8">
              <h1 className="text-xl font-bold font-display mb-1"
                  style={{ color: "var(--text-primary)" }}>
                Sign in
              </h1>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Access your merchant dashboard.
              </p>
            </div>

            {/* Demo key banner */}
            {legacyKey && (
              <div className="flex items-center justify-between px-4 py-3 mb-6"
                   style={{
                     background: "rgba(22,169,123,0.06)",
                     borderLeft: "3px solid #16A97B",
                   }}>
                <div className="min-w-0">
                  <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                    Demo session available
                  </p>
                  <p className="text-[11px] font-mono truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {legacyKey.slice(0, 22)}…
                  </p>
                </div>
                <button type="button" onClick={() => navigate("/dashboard/overview")}
                        className="shrink-0 ml-3 inline-flex items-center gap-1 text-xs font-semibold text-[#16A97B] cursor-pointer hover:underline">
                  Continue <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-0">

                {/* Email field */}
                <div style={{ borderBottom: "1px solid var(--border)" }}>
                  <label htmlFor="email"
                         className="block text-[10px] font-semibold uppercase tracking-widest pt-4 pb-1"
                         style={{ color: "var(--text-muted)" }}>
                    Email address
                  </label>
                  <input
                    id="email" type="email" required autoComplete="email"
                    placeholder="you@company.ng"
                    value={email} onChange={e => setEmail(e.target.value)}
                    className="w-full pb-3 pt-1 text-sm bg-transparent outline-none"
                    style={{
                      color: "var(--text-primary)",
                      caretColor: "#16A97B",
                    }}
                  />
                </div>

                {/* Password field */}
                <div className="relative" style={{ borderBottom: "1px solid var(--border)" }}>
                  <label htmlFor="password"
                         className="block text-[10px] font-semibold uppercase tracking-widest pt-4 pb-1"
                         style={{ color: "var(--text-muted)" }}>
                    Password
                  </label>
                  <input
                    id="password"
                    type={showPass ? "text" : "password"}
                    required autoComplete="current-password"
                    placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full pb-3 pt-1 text-sm bg-transparent outline-none pr-10"
                    style={{
                      color: "var(--text-primary)",
                      caretColor: "#16A97B",
                    }}
                    aria-describedby={formState === "error" ? "login-error" : undefined}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                          className="absolute right-0 bottom-3 cursor-pointer transition-colors"
                          aria-label={showPass ? "Hide password" : "Show password"}
                          style={{ color: "var(--text-muted)" }}>
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {formState === "error" && (
                <p id="login-error" role="alert"
                   className="mt-3 text-xs text-red-400"
                   style={{ borderLeft: "2px solid #f87171", paddingLeft: "8px" }}>
                  {errorMsg}
                </p>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={formState === "submitting" || !email.trim() || !password}
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
                    Signing in…
                  </>
                ) : (
                  <>
                    Sign in
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-xs" style={{ color: "var(--text-muted)" }}>
              No account?{" "}
              <Link to="/signup"
                    className="font-medium text-[#16A97B] hover:underline cursor-pointer">
                Create one free
              </Link>
            </p>

          </div>
        </div>
      </div>
    </div>
  );
}
