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
import { queryClient } from "./lib/queryClient.js";
import { LandingPage }    from "./pages/LandingPage.js";
import { OverviewPage }    from "./pages/OverviewPage.js";
import { OrdersPage }      from "./pages/OrdersPage.js";
import { ExceptionsPage }  from "./pages/ExceptionsPage.js";
import "./index.css";

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Overview",   to: "/dashboard/overview" },
  { label: "Orders",     to: "/dashboard/orders" },
  { label: "Exceptions", to: "/dashboard/exceptions" },
] as const;

// ─── App shell ────────────────────────────────────────────────────────────────

function DashboardLayout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-green-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold">₦</span>
          </div>
          <span className="font-semibold text-gray-900 text-lg tracking-tight">NairaRails</span>
        </div>

        <nav className="flex items-center gap-1" aria-label="Main navigation">
          {NAV_LINKS.map(({ label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => [
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-green-50 text-green-700"
                  : "text-gray-600 hover:bg-gray-100",
              ].join(" ")}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="text-xs text-gray-400 font-mono hidden sm:block">
          {import.meta.env["VITE_API_BASE"] ?? "http://localhost:3000"}
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />

      <Route path="/dashboard" element={<DashboardLayout />}>
        <Route index element={<Navigate to="/dashboard/overview" replace />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="orders" element={<OrdersPage />} />
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
