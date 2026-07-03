import React from "react";
import { ArrowRight, ArrowDown, CreditCard, RefreshCw, Send, CheckCircle2 } from "lucide-react";

export function PaymentFlowDiagram() {
  const [activeStep, setActiveStep] = React.useState<1 | 2 | 3>(1);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev === 3 ? 1 : (prev + 1) as any));
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="w-full max-w-4xl mx-auto p-6 md:p-8 rounded-2xl border border-white/10 bg-rail-steel/40 backdrop-blur-md relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-emerald-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />

      {/* Diagram Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-12 items-center relative z-10">
        
        {/* Step 1: Checkout/Order */}
        <div 
          onClick={() => setActiveStep(1)}
          className={`p-5 rounded-xl border transition-all duration-300 cursor-pointer select-none ${
            activeStep === 1 
              ? "border-[#16A97B] bg-rail-steel/80 shadow-[0_0_20px_rgba(22,169,123,0.15)]" 
              : "border-white/5 bg-rail-night hover:border-white/10"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] text-muted-slate uppercase tracking-wider">Step 01</span>
            <div className={`p-1.5 rounded-lg ${activeStep === 1 ? "bg-emerald-500/10 text-[#16A97B]" : "bg-white/5 text-muted-slate"}`}>
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <h4 className="text-sm font-semibold text-ledger-white font-display mb-1.5">NUBAN Generation</h4>
          <p className="text-xs text-muted-slate leading-relaxed mb-4">
            Marketplace creates an order. NairaRails issues a unique, dedicated virtual account.
          </p>
          <div className="p-3.5 rounded-lg bg-rail-night border border-white/5 font-mono text-[11px] space-y-1">
            <div className="text-muted-slate">ref: <span className="text-ledger-white">ord_94819</span></div>
            <div className="text-[#16A97B]">9900281721 · Wema Bank</div>
          </div>
        </div>

        {/* Step 2: Webhook/Reconciliation */}
        <div 
          onClick={() => setActiveStep(2)}
          className={`p-5 rounded-xl border transition-all duration-300 cursor-pointer select-none relative ${
            activeStep === 2 
              ? "border-[#16A97B] bg-rail-steel/80 shadow-[0_0_20px_rgba(22,169,123,0.15)]" 
              : "border-white/5 bg-rail-night hover:border-white/10"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] text-muted-slate uppercase tracking-wider">Step 02</span>
            <div className={`p-1.5 rounded-lg ${activeStep === 2 ? "bg-emerald-500/10 text-[#16A97B]" : "bg-white/5 text-muted-slate"}`}>
              <RefreshCw className="w-4 h-4 animate-spin-slow" />
            </div>
          </div>
          <h4 className="text-sm font-semibold text-ledger-white font-display mb-1.5">Automated Match</h4>
          <p className="text-xs text-muted-slate leading-relaxed mb-4">
            Buyer pays. Webhook fires. NairaRails catches it and matches it instantly to the order ref.
          </p>
          <div className="p-3.5 rounded-lg bg-rail-night border border-white/5 font-mono text-[11px] flex items-center justify-between">
            <span className="text-muted-slate">Classified:</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-[#16A97B] border border-emerald-500/20 font-bold uppercase tracking-wider text-[9px]">
              Paid Match
            </span>
          </div>
        </div>

        {/* Step 3: Instant Splits */}
        <div 
          onClick={() => setActiveStep(3)}
          className={`p-5 rounded-xl border transition-all duration-300 cursor-pointer select-none ${
            activeStep === 3 
              ? "border-[#16A97B] bg-rail-steel/80 shadow-[0_0_20px_rgba(22,169,123,0.15)]" 
              : "border-white/5 bg-rail-night hover:border-white/10"
          }`}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] text-muted-slate uppercase tracking-wider">Step 03</span>
            <div className={`p-1.5 rounded-lg ${activeStep === 3 ? "bg-emerald-500/10 text-[#16A97B]" : "bg-white/5 text-muted-slate"}`}>
              <Send className="w-4 h-4" />
            </div>
          </div>
          <h4 className="text-sm font-semibold text-ledger-white font-display mb-1.5">Insta-Split Settlements</h4>
          <p className="text-xs text-muted-slate leading-relaxed mb-4">
            NairaRails executes transfers to platform wallet, seller, and delivery rider accounts.
          </p>
          <div className="space-y-1.5 font-mono text-[10px]">
            <div className="flex justify-between items-center p-1.5 rounded bg-rail-night border border-white/5">
              <span className="text-muted-slate">Seller (85%)</span>
              <span className="text-[#16A97B] font-bold">₦38,250</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-rail-night border border-white/5">
              <span className="text-muted-slate">Platform (10%)</span>
              <span className="text-ledger-white">₦4,500</span>
            </div>
            <div className="flex justify-between items-center p-1.5 rounded bg-rail-night border border-white/5">
              <span className="text-muted-slate">Rider (5%)</span>
              <span className="text-ledger-white">₦2,250</span>
            </div>
          </div>
        </div>

      </div>

      {/* SVG Connection Rails */}
      <div className="hidden md:block absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          {/* Rail Path 1 (Step 1 -> Step 2) */}
          <path
            d="M 280, 160 H 340"
            fill="none"
            stroke="#1C2430"
            strokeWidth="2"
          />
          {activeStep >= 2 && (
            <path
              d="M 280, 160 H 340"
              fill="none"
              stroke="#16A97B"
              strokeWidth="2"
              strokeDasharray="10 100"
              className="animate-rail-pulse"
            />
          )}

          {/* Rail Path 2 (Step 2 -> Step 3) */}
          <path
            d="M 580, 160 H 645"
            fill="none"
            stroke="#1C2430"
            strokeWidth="2"
          />
          {activeStep === 3 && (
            <path
              d="M 580, 160 H 645"
              fill="none"
              stroke="#16A97B"
              strokeWidth="2"
              strokeDasharray="10 100"
              className="animate-rail-pulse"
            />
          )}
        </svg>
      </div>

      {/* CSS Pulse Style */}
      <style>{`
        @keyframes strokePulse {
          0% {
            stroke-dashoffset: 110;
          }
          100% {
            stroke-dashoffset: 0;
          }
        }
        .animate-rail-pulse {
          animation: strokePulse 1.8s linear infinite;
        }
        .animate-spin-slow {
          animation: spin 8s linear infinite;
        }
      `}</style>
    </div>
  );
}
