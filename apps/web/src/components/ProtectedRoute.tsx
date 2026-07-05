import React from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

/**
 * ProtectedRoute — gates access to dashboard pages.
 *
 * Auth strategy (in order of precedence):
 *   1. Active Supabase session → allowed in
 *   2. localStorage API key present → allowed in (backwards compat for demo seed key)
 *   3. Neither → redirect to /login
 *
 * The loading state prevents a flash-redirect to /login before the async
 * session check resolves.
 */

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [status, setStatus] = React.useState<"loading" | "allowed" | "denied">("loading");

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setStatus("allowed");
        return;
      }
      // Fallback: allow if a demo/legacy API key is stored
      const legacyKey = localStorage.getItem("nairarails_api_key");
      setStatus(legacyKey ? "allowed" : "denied");
    });

    // Listen for auth changes (login/logout in another tab, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setStatus("allowed");
      } else {
        const legacyKey = localStorage.getItem("nairarails_api_key");
        setStatus(legacyKey ? "allowed" : "denied");
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="w-5 h-5 border-2 border-slate-700 border-t-[#16A97B] rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "denied") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
