import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Phase 7: apiFetch wrapper, money.ts formatter, and all pages live here.
// For now this renders a minimal placeholder so Turborepo's build pipeline
// has a real output to verify.

const queryClient = new QueryClient();

function App() {
  return (
    <div style={{ fontFamily: "monospace", padding: "2rem" }}>
      <h1>NairaRails</h1>
      <p>Every naira has an address. Every settlement has a rule.</p>
      <p style={{ color: "#888" }}>
        Dashboard coming in Phase 7 — connect <code>VITE_API_BASE</code> to start.
      </p>
    </div>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
