import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  BrowserRouter,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { LayoutDashboard, Receipt, AlertTriangle, Settings, LogOut } from "lucide-react";
import { queryClient }    from "./lib/queryClient.js";
import { LandingPage }    from "./pages/LandingPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { LoginPage }      from "./pages/LoginPage.js";
import { OverviewPage }   from "./pages/OverviewPage.js";
import { OrdersPage }     from "./pages/OrdersPage.js";
import { ExceptionsPage } from "./pages/ExceptionsPage.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { ThemeProvider }  from "./contexts/ThemeContext.js";
import { ThemeToggle }    from "./components/ThemeToggle.js";
import { AdminPage }          from "./pages/AdminPage.js";
import { DocsPage }           from "./pages/DocsPage.js";
import { AuthCallbackPage }   from "./pages/AuthCallbackPage.js";
import { SettingsPage }       from "./pages/SettingsPage.js";
import { LogoLockup }     from "./components/Logo.js";
import { supabase }       from "./lib/supabase.js";
import { ToastProvider }  from "./contexts/ToastContext.js";
import "./index.css";

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Overview",   to: "/dashboard/overview",    icon: LayoutDashboard },
  { label: "Orders",     to: "/dashboard/orders",      icon: Receipt },
  { label: "Exceptions", to: "/dashboard/exceptions",  icon: AlertTriangle },
  { label: "Settings",   to: "/dashboard/settings",    icon: Settings },
] as const;

// ─── Sidebar layout ───────────────────────────────────────────────────────────

function DashboardLayout() {
  return (
    <div className="flex min-h-screen transition-colors duration-300"
         style={{ background: "var(--bg-base)" }}>

      {/* Ambient sidebar glow — purely decorative, matches the dashboard ambient */}
      <div
        className="pointer-events-none fixed top-0 left-0 w-60 h-full opacity-[0.035] blur-[80px] z-0"
        style={{ background: "radial-gradient(ellipse at 30% 40%, #16A97B 0%, transparent 70%)" }}
        aria-hidden
      />

      {/* Sidebar */}
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
        {/* Brand badge / logo */}
        <div
          className="relative flex items-center gap-3 px-5 py-5 overflow-hidden"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {/* Subtle green shimmer behind the logo */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 0% 50%, rgba(22,169,123,0.3) 0%, transparent 70%)" }}
            aria-hidden
          />
          <div className="relative z-10">
            <LogoLockup size={28} textSize="text-sm" />
          </div>
          {/* Version pill */}
          <span
            className="relative z-10 ml-auto text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-md shrink-0"
            style={{
              background: "rgba(22,169,123,0.12)",
              border: "1px solid rgba(22,169,123,0.25)",
              color: "#16A97B",
            }}
          >
            v2
          </span>
        </div>

        {/* Section label */}
        <div className="px-5 pt-5 pb-2">
          <p
            className="text-[9px] font-bold uppercase tracking-[0.18em]"
            style={{ color: "rgba(100,116,139,0.7)" }}
          >
            Navigation
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 pb-4 space-y-0.5" aria-label="Dashboard navigation">
          {NAV_LINKS.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
            >
              {({ isActive }) => (
                <span
                  className="relative flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer group"
                  style={{
                    background: isActive
                      ? "linear-gradient(135deg, rgba(22,169,123,0.20) 0%, rgba(22,169,123,0.08) 100%)"
                      : "transparent",
                    color: isActive ? "#16A97B" : "var(--text-muted)",
                    border: isActive
                      ? "1px solid rgba(22,169,123,0.25)"
                      : "1px solid transparent",
                    boxShadow: isActive
                      ? "0 2px 12px rgba(22,169,123,0.12), inset 0 1px 0 rgba(255,255,255,0.05)"
                      : "none",
                    textShadow: isActive ? "0 0 16px rgba(22,169,123,0.5)" : "none",
                  }}
                >
                  {/* Active left indicator bar */}
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                      style={{ background: "linear-gradient(180deg, #16A97B, rgba(22,169,123,0.3))", boxShadow: "0 0 8px rgba(22,169,123,0.6)" }}
                    />
                  )}
                  {/* Icon with glow on active */}
                  <span
                    className="w-5 h-5 shrink-0 flex items-center justify-center rounded-md transition-all duration-200"
                    style={{
                      background: isActive ? "rgba(22,169,123,0.15)" : "transparent",
                      boxShadow: isActive ? "0 0 8px rgba(22,169,123,0.2)" : "none",
                    }}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-4 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)" }} />

        {/* Bottom actions */}
        <div className="px-3 py-4 space-y-1">
          {/* API endpoint chip */}
          <div
            className="flex items-center gap-2 mx-1 mb-2 px-3 py-2 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "#16A97B", boxShadow: "0 0 6px rgba(22,169,123,0.8)" }}
            />
            <span className="text-[10px] font-mono truncate" style={{ color: "rgba(100,116,139,0.8)" }}>
              {import.meta.env["VITE_API_BASE"] ?? "localhost:3000"}
            </span>
          </div>

          {/* Theme toggle */}
          <div className="px-3 py-1.5">
            <ThemeToggle showSystemOption />
          </div>

          {/* Sign out */}
          <button
            type="button"
            onClick={async () => {
              localStorage.removeItem("nairarails_api_key");
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="flex items-center gap-3 w-full text-left rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 cursor-pointer group"
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
            <span
              className="w-5 h-5 shrink-0 flex items-center justify-center rounded-md transition-all duration-200"
              style={{ background: "transparent" }}
            >
              <LogOut className="w-3.5 h-3.5" />
            </span>
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex"
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(10,14,20,0.95)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        {NAV_LINKS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors duration-150"
            style={({ isActive }) => ({ color: isActive ? "var(--brand)" : "var(--text-muted)" })}
          >
            {({ isActive }) => (
              <>
                <span
                  className="w-6 h-6 flex items-center justify-center rounded-lg transition-all duration-200"
                  style={{
                    background: isActive ? "rgba(22,169,123,0.15)" : "transparent",
                    boxShadow: isActive ? "0 0 8px rgba(22,169,123,0.25)" : "none",
                  }}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Main content */}
      <main className="flex-1 md:ml-60 min-h-screen pb-20 md:pb-0">
        <Outlet />
      </main>
    </div>
  );
}

// ─── Routes ───────────────────────────────────────────────────────────────────

function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/signup" element={<OnboardingPage />} />
      <Route path="/login"  element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/admin"  element={<AdminPage />} />
      <Route path="/docs"   element={<DocsPage />} />

      {/* Protected dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard/overview" replace />} />
        <Route path="overview"   element={<OverviewPage />} />
        <Route path="orders"     element={<OrdersPage />} />
        <Route path="exceptions" element={<ExceptionsPage />} />
        <Route path="settings"   element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element in index.html");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
