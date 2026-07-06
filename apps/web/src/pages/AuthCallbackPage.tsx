/**
 * AuthCallbackPage.tsx
 *
 * Handles Supabase's email-confirmation redirect.
 * Supabase appends #access_token=...&type=email_confirmation to the URL.
 * The Supabase client detects and exchanges those tokens automatically
 * (detectSessionFromUrl is true by default).
 *
 * After confirming the session we:
 *   1. Hit GET /auth/me — this syncs emailVerified=true in our DB
 *   2. Hit POST /merchants/keys/issue — auto-issue the API key
 *   3. Save the key to localStorage so dashboard API calls work immediately
 *   4. Navigate to /dashboard/settings so the merchant can copy their key
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { apiFetch, apiPost } from "../lib/apiFetch.js";

interface MerchantProfile { emailVerified: boolean; keyPrefix: string | null; }
interface IssueKeyResponse { apiKey: string; }

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = React.useState("Verifying your email…");

  React.useEffect(() => {
    let cancelled = false;

    async function run() {
      // Wait briefly for the Supabase client to parse the URL hash tokens.
      await new Promise(r => setTimeout(r, 600));
      if (cancelled) return;

      const { data, error } = await supabase.auth.getSession();

      if (error || !data.session) {
        setMessage("Link expired or already used. Redirecting to sign in…");
        setTimeout(() => navigate("/login"), 2000);
        return;
      }

      // Step 1 — sync emailVerified in our DB
      setMessage("Confirming your account…");
      try {
        const profile = await apiFetch<MerchantProfile>("/api/v1/auth/me");
        if (cancelled) return;

        // Step 2 — auto-issue key if not already issued
        if (!profile.keyPrefix) {
          setMessage("Issuing your API key…");
          try {
            const keyData = await apiPost<IssueKeyResponse>("/api/v1/merchants/keys/issue");
            if (!cancelled && keyData.apiKey) {
              localStorage.setItem("nairarails_api_key", keyData.apiKey);
            }
          } catch {
            // Key issue failed (e.g. already exists from a concurrent request) — not fatal.
            // The merchant can issue from Settings.
          }
        }
      } catch {
        // /auth/me failed — still let them into the dashboard, Settings will show the state.
      }

      if (cancelled) return;
      // Step 3 — redirect to overview; pass raw key in route state so the
      // dashboard can show it in a one-time copy modal without ever re-fetching it.
      setMessage("All set! Taking you to your dashboard…");
      navigate("/dashboard/overview", {
        replace: true,
        state:   { newApiKey: localStorage.getItem("nairarails_api_key") ?? null },
      });
    }

    run();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-5 h-5 border-2 border-slate-700 border-t-[#16A97B] rounded-full animate-spin" />
      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        {message}
      </p>
    </div>
  );
}
