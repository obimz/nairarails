/**
 * LoginPage.tsx — API key sign-in
 *
 * NairaRails is key-authenticated (no password).  This page lets returning
 * merchants paste their API key and be routed to the dashboard.
 *
 * Design: glassmorphism, theme-aware CSS variables, accessible, responsive.
 */

import React from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, Key, AlertCircle, ChevronRight } from "lucide-react";
import { ThemeToggle } from "../components/ThemeToggle.js";

type FormState = "idle" | "submitting" | "error";

export function LoginPage() {
  const navigate = useNavigate();

  const [apiKey,     setApiKey]     = React.useState("");
  const [showKey,    setShowKey]    = React.useState(false);
  const [formState,  setFormState]  = React.useState<FormState>("idle");
  const [errorMsg,   setErrorMsg]   = React.useState("");

  // If a key is already stored, offer to continue with it
  const storedKey = React.useMemo(() => {
    try { return localStorage.getItem("nairarails_api_key") ?? ""; } catch { return ""; }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const key = apiKey.trim();
    if (!key) return;

    setFormState("submitting");
    setErrorMsg("");

    // Quick sanity check on the key prefix before storing
    if (!key.startsWith("nrk_")) {
      setErrorMsg("That doesn't look like a valid NairaRails API key. Keys start with nrk_");
      setFormState("error");
      return;
    }

    try {
      localStorage.setItem("nairarails_api_key", key);
      navigate("/dashboard/overview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setErrorMsg(msg);
      setFormState("error");
    }
  }

  function useDemoKey() {
    const demoKey = "nrk_live_demo_seed_key";
    localStorage.setItem("nairarails_api_key", demoKey);
    navigate("/dashboard/overview");
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
        <Link to="/" className="flex items-center gap-2 cursor-pointer group">
          <div className="w-7 h-7 rounded-lg bg-[#16A97B] flex items-center justify-center group-hover:shadow-md group-hover:shadow-emerald-500/30 transition-all duration-200">
            <span className="text-black text-xs font-bold">₦</span>
          </div>
          <span className="font-bold font-display text-sm" style={{ color: "var(--text-primary)" }}>NairaRails</span>
        </Link>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Link
            to="/signup"
            className="text-sm font-medium transition-colors duration-200 cursor-pointer"
            style={{ color: "var(--text-muted)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "var(--text-brand)")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            Sign up
          </Link>
        </div>
      </div>

      {/* Page body */}
      <div className="flex items-center justify-center min-h-[calc(100vh-61px)] px-4 py-16">
        <div className="w-full max-w-md">

          {/* Icon + heading */}
          <div className="text-center mb-8">
            <div
              className="mx-auto mb-5 w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20"
              style={{ background: "rgba(22,169,123,0.12)", border: "1px solid rgba(22,169,123,0.25)" }}
            >
              <Key className="w-8 h-8 text-[#16A97B]" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold font-display mb-2" style={{ color: "var(--text-primary)" }}>
              Welcome back
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Paste your API key to access your dashboard.
            </p>
          </div>

          {/* Existing key banner */}
          {storedKey && (
            <div
              className="flex items-center gap-3 rounded-xl px-4 py-3 mb-5 text-sm"
              style={{ background: "rgba(22,169,123,0.08)", border: "1px solid rgba(22,169,123,0.20)" }}
            >
              <div className="w-2 h-2 rounded-full bg-[#16A97B] shrink-0 animate-pulse" />
              <div className="flex-1 min-w-0">
                <p className="font-medium" style={{ color: "var(--text-primary)" }}>Saved key detected</p>
                <p className="text-xs font-mono truncate mt-0.5" style={{ color: "var(--text-muted)" }}>
                  {storedKey.slice(0, 20)}…
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate("/dashboard/overview")}
                className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[#16A97B] hover:text-[#128a64] transition-colors cursor-pointer"
              >
                Continue <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Form card */}
          <div className="card-dark p-8">
            <form onSubmit={handleSubmit} noValidate>
              <div className="space-y-5">

                <div>
                  <label htmlFor="api-key" className="block text-sm font-medium mb-1.5"
                         style={{ color: "var(--text-secondary)" }}>
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      id="api-key"
                      type={showKey ? "text" : "password"}
                      required
                      autoComplete="current-password"
                      placeholder="nrk_live_…"
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      className="input-dark pr-11"
                      aria-describedby={formState === "error" ? "key-error" : undefined}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 cursor-pointer transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#16A97B]/50 focus:ring-offset-2 focus:ring-offset-transparent rounded"
                      aria-label={showKey ? "Hide API key" : "Show API key"}
                      style={{ color: "var(--text-muted)" }}
                    >
                      {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    Your key begins with <code className="font-mono text-[#16A97B]">nrk_live_</code> or{" "}
                    <code className="font-mono text-[#16A97B]">nrk_test_</code>
                  </p>
                </div>

                {/* Error */}
                {formState === "error" && (
                  <div
                    id="key-error"
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm text-red-400"
                    style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)" }}
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {errorMsg}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={formState === "submitting" || !apiKey.trim()}
                  className="btn-primary w-full justify-center gap-2 py-3.5 text-base"
                >
                  {formState === "submitting" ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Access Dashboard
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Demo key shortcut */}
            <div
              className="mt-6 pt-5 text-center"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                Want to try the demo first?
              </p>
              <button
                type="button"
                onClick={useDemoKey}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A97B] hover:text-[#128a64] transition-colors cursor-pointer"
              >
                Use demo key (seed data)
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Signup link */}
          <p className="text-center text-xs mt-6" style={{ color: "var(--text-muted)" }}>
            Don't have an account yet?{" "}
            <Link
              to="/signup"
              className="font-semibold text-[#16A97B] hover:text-[#128a64] transition-colors cursor-pointer"
            >
              Sign up for free
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
