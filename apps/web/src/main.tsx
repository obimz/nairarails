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
import { LayoutDashboard, Receipt, AlertTriangle, LogOut } from "lucide-react";
import { queryClient }    from "./lib/queryClient.js";
import { LandingPage }    from "./pages/LandingPage.js";
import { OnboardingPage } from "./pages/OnboardingPage.js";
import { OverviewPage }   from "./pages/OverviewPage.js";
import { OrdersPage }     from "./pages/OrdersPage.js";
import { ExceptionsPage } from "./pages/ExceptionsPage.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import "./index.css";

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Overview",   to: "/dashboard/overview",    icon: LayoutDashboard },
  { label: "Orders",     to: "/dashboard/orders",      icon: Receipt },
  { label: "Exceptions", to: "/dashboard/exceptions",  icon: AlertTriangle },
] as const;

// ─── Sidebar layout ───────────────────────────────────────────────────────────

function DashboardLayout() {
  return (
    <div className="flex min-h-screen bg-[#020617]">

      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-white/10 bg-[#0F172A] fixed inset-y-0 left-0 z-30">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
          <div className="w-7 h-7 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
            <span className="text-black text-xs font-bold">₦</span>
          </div>
          <span className="font-bold text-slate-50 tracking-tight">NairaRails</span>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Dashboard navigation">
          {NAV_LINKS.map(({ label, to, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                isActive ? "nav-link-active" : "nav-link"
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom actions */}
        <div className="px-3 py-4 border-t border-white/10 space-y-1">
          <div className="px-3 py-2 text-xs text-slate-600 font-mono truncate">
            {import.meta.env["VITE_API_BASE"] ?? "localhost:3000"}
          </div>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem("nairarails_api_key");
              window.location.href = "/signup";
            }}
            className="nav-link w-full text-left text-slate-500 hover:text-red-400"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex border-t border-white/10 bg-[#0F172A]">
        {NAV_LINKS.map(({ label, to, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              [
                "flex flex-1 flex-col items-center gap-1 py-3 text-xs font-medium transition-colors duration-150",
                isActive ? "text-green-400" : "text-slate-500",
              ].join(" ")
            }
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
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
