import React from "react";
import { CreditCard, RefreshCw, Send } from "lucide-react";

const STEPS = [
  {
    id: 1 as const,
    label: "Step 01",
    title: "NUBAN Generation",
    desc: "Marketplace creates an order. NairaRails issues a unique, dedicated virtual account.",
    icon: CreditCard,
    code: (
      <div className="font-mono text-[11px] space-y-1">
        <div style={{ color: "var(--text-muted)" }}>
          ref: <span style={{ color: "var(--text-primary)" }}>ord_94819</span>
        </div>
        <div style={{ color: "var(--text-brand)" }}>9900281721 · Wema Bank</div>
      </div>
    ),
  },
  {
    id: 2 as const,
    label: "Step 02",
    title: "Automated Match",
    desc: "Buyer pays. Webhook fires. NairaRails catches it and matches it instantly to the order ref.",
    icon: RefreshCw,
    code: (
      <div className="font-mono text-[11px] flex items-center justify-between">
        <span style={{ color: "var(--text-muted)" }}>Classified:</span>
        <span
          className="px-2 py-0.5 rounded font-bold uppercase tracking-wider text-[9px]"
          style={{
            background: "rgba(22,169,123,0.12)",
            color: "var(--text-brand)",
            border: "1px solid rgba(22,169,123,0.25)",
          }}
        >
          Paid Match
        </span>
      </div>
    ),
  },
  {
    id: 3 as const,
    label: "Step 03",
    title: "Insta-Split Settlements",
    desc: "NairaRails executes transfers to platform wallet, seller, and delivery rider accounts.",
    icon: Send,
    code: (
      <div className="space-y-1.5 font-mono text-[10px]">
        {[
          { label: "Seller (85%)",   val: "₦38,250", brand: true },
          { label: "Platform (10%)", val: "₦4,500",  brand: false },
          { label: "Rider (5%)",     val: "₦2,250",  brand: false },
        ].map(({ label, val, brand }) => (
          <div
            key={label}
            className="flex justify-between items-center px-2.5 py-1.5 rounded"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            <span style={{ color: "var(--text-muted)" }}>{label}</span>
            <span
              className="font-bold"
              style={{ color: brand ? "var(--text-brand)" : "var(--text-primary)" }}
            >
              {val}
            </span>
          </div>
        ))}
      </div>
    ),
  },
];

export function PaymentFlowDiagram() {
  const [activeStep, setActiveStep] = React.useState<1 | 2 | 3>(1);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev === 3 ? 1 : ((prev + 1) as 1 | 2 | 3)));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="w-full max-w-4xl mx-auto p-6 md:p-8 rounded-2xl backdrop-blur-md relative overflow-hidden transition-colors duration-300"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
    >
      {/* Background glow */}
      <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />

      {/* Step cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 relative z-10">
        {STEPS.map(({ id, label, title, desc, icon: Icon, code }) => {
          const isActive = activeStep === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveStep(id)}
              className="text-left p-5 rounded-xl transition-all duration-300 cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-[#16A97B]/50"
              style={{
                background: isActive ? "var(--bg-elevated)" : "var(--bg-elevated)",
                border: `1px solid ${isActive ? "rgba(22,169,123,0.50)" : "var(--border)"}`,
                boxShadow: isActive ? "0 0 20px rgba(22,169,123,0.10)" : "none",
              }}
              aria-pressed={isActive}
              aria-label={`${title} — step ${id}`}
            >
              {/* Header row */}
              <div className="flex items-center justify-between mb-4">
                <span
                  className="font-mono text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--text-muted)" }}
                >
                  {label}
                </span>
                <div
                  className="p-1.5 rounded-lg transition-all duration-300"
                  style={{
                    background: isActive ? "rgba(22,169,123,0.12)" : "var(--bg-glass)",
                    color: isActive ? "var(--text-brand)" : "var(--text-muted)",
                  }}
                >
                  <Icon className={`w-4 h-4${id === 2 ? " animate-spin-slow" : ""}`} />
                </div>
              </div>

              {/* Title & desc */}
              <h4
                className="text-sm font-semibold font-display mb-1.5"
                style={{ color: "var(--text-primary)" }}
              >
                {title}
              </h4>
              <p
                className="text-xs leading-relaxed mb-4"
                style={{ color: "var(--text-secondary)" }}
              >
                {desc}
              </p>

              {/* Code area */}
              <div
                className="p-3.5 rounded-lg"
                style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}
              >
                {code}
              </div>
            </button>
          );
        })}
      </div>

      {/* Step dots */}
      <div className="flex items-center justify-center gap-2 mt-6 md:hidden">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setActiveStep(n as 1 | 2 | 3)}
            className="w-2 h-2 rounded-full transition-all duration-300 cursor-pointer"
            style={{
              background: activeStep === n ? "var(--text-brand)" : "var(--border)",
              transform: activeStep === n ? "scale(1.4)" : "scale(1)",
            }}
            aria-label={`Go to step ${n}`}
          />
        ))}
      </div>

      <style>{`
        @keyframes spin-slow { to { transform: rotate(360deg); } }
        .animate-spin-slow   { animation: spin-slow 8s linear infinite; }
      `}</style>
    </div>
  );
}
