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

      {/* Sidebar */}
      <aside
        className="hidden md:flex flex-col w-60 shrink-0 fixed inset-y-0 left-0 z-30"
        style={{ background: "var(--bg-surface)", borderRight: "1px solid var(--border)" }}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5"
             style={{ borderBottom: "1px solid var(--border)" }}>
          <LogoLockup size={28} textSize="text-sm" />
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Dashboard navigation">
          {NAV_LINKS.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => isActive ? "nav-link-active" : "nav-link"}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-4 space-y-1" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="px-3 py-2 text-xs font-mono truncate" style={{ color: "var(--text-muted)" }}>
            {import.meta.env["VITE_API_BASE"] ?? "localhost:3000"}
          </div>
          <div className="px-3 py-2">
            <ThemeToggle showSystemOption />
          </div>
          <button
            type="button"
            onClick={async () => {
              localStorage.removeItem("nairarails_api_key");
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="nav-link w-full text-left hover:text-red-500"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex"
        style={{ borderTop: "1px solid var(--border)", background: "var(--bg-surface)" }}
      >
        {NAV_LINKS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors duration-150",
                isActive ? "text-[#16A97B]" : "",
              ].join(" ")
            }
            style={({ isActive }) => ({ color: isActive ? "var(--brand)" : "var(--text-muted)" })}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
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
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </React.StrictMode>
);
