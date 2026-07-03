import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient.js";
import { OverviewPage }    from "./pages/OverviewPage.js";
import { OrdersPage }      from "./pages/OrdersPage.js";
import { ExceptionsPage }  from "./pages/ExceptionsPage.js";
import "./index.css";

// ─── Nav config ───────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: "Overview",   page: "overview" },
  { label: "Orders",     page: "orders" },
  { label: "Exceptions", page: "exceptions" },
] as const;

type Page = typeof NAV_LINKS[number]["page"];

// ─── App shell ────────────────────────────────────────────────────────────────

function App() {
  const [currentPage, setCurrentPage] = React.useState<Page>("overview");

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
          {NAV_LINKS.map(({ label, page }) => (
            <button
              key={page}
              onClick={() => setCurrentPage(page)}
              className={[
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                currentPage === page
                  ? "bg-green-50 text-green-700"
                  : "text-gray-600 hover:bg-gray-100",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="text-xs text-gray-400 font-mono hidden sm:block">
          {import.meta.env["VITE_API_BASE"] ?? "http://localhost:3000"}
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1">
        {currentPage === "overview"   && <OverviewPage />}
        {currentPage === "orders"     && <OrdersPage />}
        {currentPage === "exceptions" && <ExceptionsPage />}
      </main>
    </div>
  );
}

// ─── Mount ────────────────────────────────────────────────────────────────────

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element in index.html");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
