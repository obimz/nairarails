/**
 * LandingPage.tsx — modern SaaS landing page.
 *
 * Enhanced with ui-ux-pro-max design system: improved glassmorphism effects,
 * better accessibility, enhanced UX interactions, and professional polish.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowRight, ChevronDown, Check, Shield, Key, Search, RefreshCw, Terminal, ExternalLink, Zap, Lock, AlertTriangle } from "lucide-react";
import { PaymentFlowDiagram } from "../components/PaymentFlowDiagram.js";
import { ThemeToggle } from "../components/ThemeToggle.js";

gsap.registerPlugin(ScrollTrigger);

// ─── Animated number counter ──────────────────────────────────────────────────
function Counter({ target, prefix = "" }: { target: number; prefix?: string }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const obj = React.useRef({ val: 0 });

  React.useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      once: true,
      onEnter: () => {
        gsap.to(obj.current, {
          val: target,
          duration: 2.2,
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = prefix + Math.floor(obj.current.val).toLocaleString("en-NG");
          },
        });
      },
    });
  }, [target, prefix]);

  return <span ref={ref} className="font-mono font-bold" style={{ color: "var(--text-primary)" }}>0</span>;
}

// ─── Section wrapper — fades in on scroll ─────────────────────────────────────
function FadeSection({ children, className = "" }: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(
      ref.current,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 0.8,
        ease: "power2.out",
        scrollTrigger: {
          trigger: ref.current,
          start: "top 80%",
          once: true,
        },
      }
    );
  }, []);

  return (
    <div ref={ref} className={className} style={{ opacity: 0 }}>
      {children}
    </div>
  );
}

// ─── Code snippet ─────────────────────────────────────────────────────────────
function CodeSnippet({ code }: { code: string }) {
  return (
    <pre
      className="rounded-lg border p-4 text-[11px] font-mono text-[#16A97B] overflow-x-auto leading-relaxed whitespace-pre select-all"
      style={{ background: "var(--bg-base)", borderColor: "var(--border)" }}
    >
      {code}
    </pre>
  );
}

// ─── Enhanced Step Card with Glassmorphism ──────────────────────────────────────
function StepCard({ num, title, desc, code }: {
  num: string;
  title: string;
  desc: string;
  code: string;
}) {
  const [isHovered, setIsHovered] = React.useState(false);

  return (
    <FadeSection>
      <div
        className="group relative rounded-2xl backdrop-blur-md p-6 transition-all duration-300 cursor-pointer h-full"
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-card)",
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="article"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsHovered(!isHovered); }}
      >
        {/* Hover tint */}
        <div className="absolute inset-0 rounded-2xl bg-[#16A97B]/[0.03] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

        {/* Step number + title */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full font-mono font-bold text-sm transition-all duration-300"
               style={{
                 background: "rgba(22,169,123,0.10)",
                 border: "1px solid rgba(22,169,123,0.25)",
                 color: "var(--text-brand)",
               }}>
            {num}
          </div>
          <h3 className="text-lg font-semibold font-display transition-colors duration-300 group-hover:text-[#16A97B]"
              style={{ color: "var(--text-primary)" }}>
            {title}
          </h3>
        </div>

        {/* Description */}
        <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
          {desc}
        </p>

        {/* Code block */}
        <div
          className="rounded-xl p-4 overflow-x-auto transition-all duration-300"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
        >
          <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap select-all"
               style={{ color: "var(--text-brand)" }}>
            {code}
          </pre>
        </div>

        {/* Focus ring */}
        <div className="absolute inset-0 rounded-2xl ring-2 ring-[#16A97B]/0 ring-offset-2 ring-offset-transparent transition-all duration-200 group-focus:ring-[#16A97B]/50 pointer-events-none" />
      </div>
    </FadeSection>
  );
}

// ─── Live Mock Dashboard Component ──────────────────────────────────────────────
interface MockTx {
  id: string;
  status: "paid" | "underpayment" | "overpayment" | "unmatched";
  amount: number;
  expected: number;
  time: string;
}

function LiveMockDashboard() {
  const [txs, setTxs] = React.useState<MockTx[]>([
    { id: "ord-492", status: "paid", amount: 45000, expected: 45000, time: "Just now" },
    { id: "ord-491", status: "underpayment", amount: 48000, expected: 50000, time: "1 min ago" },
    { id: "ord-490", status: "paid", amount: 12500, expected: 12500, time: "4 min ago" },
  ]);

  const [expectedTotal, setExpectedTotal] = React.useState(107500);
  const [receivedTotal, setReceivedTotal] = React.useState(105500);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const orderId = `ord-${Math.floor(100 + Math.random() * 899)}`;
      const isUnder = Math.random() < 0.25;
      const expected = [20000, 35000, 80000, 15000][Math.floor(Math.random() * 4)]!;
      const amount = isUnder ? expected - 2000 : expected;
      const status: MockTx["status"] = isUnder ? "underpayment" : "paid";

      const newTx: MockTx = {
        id: orderId,
        status,
        amount,
        expected,
        time: "Just now"
      };

      setTxs((prev) => {
        const updated = [newTx, ...prev.slice(0, 3)];
        return updated.map((t, idx) => ({
          ...t,
          time: idx === 0 ? "Just now" : `${idx} min ago`
        }));
      });

      setExpectedTotal((prev) => prev + expected);
      setReceivedTotal((prev) => prev + amount);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className="rounded-2xl backdrop-blur-md p-6 w-full font-sans text-xs transition-all duration-300"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
      role="region"
      aria-label="Live payment dashboard simulation"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <div className="uppercase tracking-wider text-[9px] font-mono" style={{ color: "var(--text-muted)" }}>Sandbox Console</div>
          <h4 className="text-sm font-bold font-display" style={{ color: "var(--text-primary)" }}>Real-Time Webhook Pipeline</h4>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px]" style={{ color: "var(--text-brand)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#16A97B] animate-pulse" />
          <span>CONNECTED</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        {[
          { label: "EXPECTED today", value: `₦${expectedTotal.toLocaleString("en-NG")}`, color: "var(--text-primary)" },
          { label: "COLLECTED today", value: `₦${receivedTotal.toLocaleString("en-NG")}`, color: "var(--text-brand)" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="p-4 rounded-xl cursor-default transition-all duration-200"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            <div className="text-[10px] mb-1 font-mono uppercase" style={{ color: "var(--text-muted)" }}>{label}</div>
            <div className="text-base font-bold font-mono" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Ledger Feed */}
      <div className="space-y-3">
        <div className="text-[9px] font-mono uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Live Ledger Logs</div>
        <div className="space-y-2 max-h-[160px] overflow-y-hidden">
          {txs.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between p-3 rounded-xl transition-all duration-200 cursor-pointer"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              tabIndex={0}
              role="button"
              aria-label={`Transaction ${tx.id}, status: ${tx.status}, amount: ${tx.amount} naira`}
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{tx.id}</span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono capitalize border ${
                  tx.status === "paid"
                    ? "bg-emerald-500/15 text-[#16A97B] border-emerald-500/30"
                    : "bg-amber-500/15 text-[#E8A33D] border-amber-500/30"
                }`}>
                  {tx.status}
                </span>
              </div>
              <div className="text-right">
                <div className="font-mono font-medium" style={{ color: "var(--text-primary)" }}>₦{tx.amount.toLocaleString("en-NG")}</div>
                <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>{tx.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main SaaS Landing Page ───────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState<"hmac" | "idempotency" | "lookup">("hmac");

  return (
    <div
      className="relative min-h-screen overflow-x-hidden transition-colors duration-300"
      style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}
    >
      {/* ── Background glows (theme-aware via CSS vars) ───────────────────────── */}
      <div className="fixed inset-0 auth-bg opacity-60 pointer-events-none z-0" />
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none z-0"
           style={{ background: "radial-gradient(circle, rgba(22,169,123,0.08) 0%, transparent 70%)" }} />
      <div className="fixed top-1/3 right-1/4 w-[700px] h-[700px] rounded-full blur-[160px] pointer-events-none z-0"
           style={{ background: "radial-gradient(circle, rgba(22,169,123,0.05) 0%, transparent 70%)" }} />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-50 w-full backdrop-blur-md transition-colors duration-300"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-glass)" }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 md:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#16A97B] flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <span className="text-black text-sm font-bold">₦</span>
            </div>
            <span className="font-bold font-display tracking-tight text-lg" style={{ color: "var(--text-primary)" }}>
              NairaRails
            </span>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#16A97B] hover:bg-[#128a64] text-black font-semibold rounded-xl shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/30 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#16A97B] focus:ring-offset-2 focus:ring-offset-transparent text-sm"
              aria-label="Get API access"
            >
              Get API Access
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* ── Content Container with Enhanced Responsive Design ─────────────────── */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20 md:space-y-32 lg:space-y-36 pb-24">

        {/* ════════════════════════════════════════════════════════════════
            SECTION 1 — HERO with Enhanced Glassmorphism
        ════════════════════════════════════════════════════════════════ */}
        <section className="pt-16 md:pt-24 flex flex-col items-center text-center space-y-8">
          <FadeSection className="space-y-6 max-w-4xl">
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono transition-all duration-300 cursor-default"
              style={{ background: "rgba(22,169,123,0.10)", border: "1px solid rgba(22,169,123,0.25)", color: "var(--text-brand)" }}
            >
              <Zap className="w-3.5 h-3.5" />
              Marketplace Payments Infrastructure · Nigeria
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A97B] animate-pulse" />
            </div>
            <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold font-display leading-[1.05] tracking-tight px-4 sm:px-0"
                style={{ color: "var(--text-primary)" }}>
              Every naira has{" "}
              <span className="relative inline-block">
                <span style={{ color: "var(--text-brand)" }}>an address.</span>
              </span>
              <br />
              Every settlement has{" "}
              <span className="relative inline-block">
                <span style={{ color: "var(--text-brand)" }}>a rule.</span>
              </span>
            </h1>
            <p className="text-base sm:text-lg leading-relaxed max-w-2xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              NairaRails assigns every order on your checkout its own{" "}
              <strong style={{ color: "var(--text-primary)" }}>unique virtual account (NUBAN)</strong>.{" "}
              Automate payment matching, classify discrepancies, and execute instant split settlements.
            </p>
          </FadeSection>

          <FadeSection className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 justify-center max-w-md sm:max-w-none mx-auto">
            <button
              type="button"
              onClick={() => navigate("/signup")}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-[#16A97B] hover:bg-[#128a64] text-black font-semibold rounded-xl shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#16A97B] focus:ring-offset-2 focus:ring-offset-transparent text-base"
              aria-label="Get API access to start integrating NairaRails"
            >
              Get API Access
              <ArrowRight className="w-5 h-5" />
            </button>
            <a
              href="#how-it-works"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent"
              style={{ background: "var(--bg-glass)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}
              aria-label="Learn more about how NairaRails works"
            >
              Learn More
              <ChevronDown className="w-4 h-4" />
            </a>
          </FadeSection>

          {/* Interactive CSS diagram replaces 3D */}
          <FadeSection className="w-full pt-8">
            <PaymentFlowDiagram />
          </FadeSection>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 2 — THE PROBLEM with Enhanced Cards
        ════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          <div className="lg:col-span-5 space-y-6">
            <FadeSection>
              <p className="text-xs font-mono font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                The Cost of Spreadsheet Plumbing
              </p>
              <h2 className="text-3xl sm:text-5xl font-bold font-display tracking-tight leading-tight mt-2"
                  style={{ color: "var(--text-primary)" }}>
                ₦<Counter target={35560000000} />
              </h2>
              <p className="leading-relaxed text-sm sm:text-base" style={{ color: "var(--text-secondary)" }}>
                Lost to publicly documented reconciliation failures in Nigeria between 2023 and 2024. A shared corporate account with manual spreadsheet matching is a margin leak.
              </p>
              <div className="p-4 rounded-xl backdrop-blur-sm"
                   style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5"
                       style={{ background: "rgba(245,158,11,0.15)" }}>
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                  </div>
                  <p className="text-xs font-mono leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    <strong className="text-amber-600 dark:text-amber-400">NIBSS Leak Moment:</strong>{" "}
                    When NIBSS lagged in Sept 2024, ₦13.66B was credited with no debit—uncaught at the application layer until Monday morning.
                  </p>
                </div>
              </div>
            </FadeSection>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <FadeSection>
              <div
                className="rounded-2xl p-6 h-full flex flex-col justify-between transition-all duration-300 cursor-default"
                style={{ background: "var(--bg-surface)", border: "1px solid rgba(239,68,68,0.25)", boxShadow: "var(--shadow-card)" }}
                role="region"
                aria-labelledby="without-nairarails"
              >
                <div>
                  <p id="without-nairarails" className="text-[10px] font-mono uppercase font-bold mb-4 tracking-wider text-red-500">Without NairaRails</p>
                  <ul className="space-y-4 text-xs" role="list" style={{ color: "var(--text-secondary)" }}>
                    {["One shared account for 1000s of transactions", "Manual transfer name matching (hours per day)", "Next-day spreadsheet batch settlements", "Underpayments credited in full, leaking margin"].map(text => (
                      <li key={text} className="flex items-start gap-3" role="listitem">
                        <span className="text-red-500 font-bold text-sm mt-0.5 shrink-0" aria-hidden="true">✕</span>
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </FadeSection>

            <FadeSection>
              <div
                className="rounded-2xl p-6 h-full flex flex-col justify-between transition-all duration-300 cursor-default"
                style={{ background: "var(--bg-surface)", border: "1px solid rgba(22,169,123,0.30)", boxShadow: "var(--shadow-card)" }}
                role="region"
                aria-labelledby="with-nairarails"
              >
                <div>
                  <p id="with-nairarails" className="text-[10px] font-mono uppercase font-bold mb-4 tracking-wider" style={{ color: "var(--text-brand)" }}>With NairaRails</p>
                  <ul className="space-y-4 text-xs" role="list" style={{ color: "var(--text-secondary)" }}>
                    {["Dedicated NUBAN issued per order", "Millisecond webhook matches", "Instant, automated split settlement routing", "Discrepancies caught and quarantined automatically"].map(text => (
                      <li key={text} className="flex items-start gap-3" role="listitem">
                        <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--text-brand)" }} aria-hidden="true" />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </FadeSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 3 — HOW IT WORKS
        ════════════════════════════════════════════════════════════════ */}
        <section id="how-it-works" className="space-y-12">
          <FadeSection className="text-center max-w-2xl mx-auto space-y-4">
            <p className="text-xs font-mono font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>The Flow</p>
            <h2 className="text-3xl sm:text-4xl font-bold font-display" style={{ color: "var(--text-primary)" }}>How NairaRails works</h2>
            <p className="text-sm sm:text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Integrate NairaRails into your existing checkout with a single API call. We handle NUBAN generation, tracking, and settlement.
            </p>
          </FadeSection>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            <StepCard
              num="01"
              title="Issue Virtual NUBAN"
              desc="Your backend calls NairaRails when a customer checks out. We request a NUBAN and map it to your order ref."
              code={`POST /api/v1/orders\nHeaders: { x-api-key: "nrk_..." }\nBody: {\n  "order_ref": "ord-2041",\n  "expected_amount_kobo": 500000\n}`}
            />
            <StepCard
              num="02"
              title="Webhook Classification"
              desc="Buyer transfers to the NUBAN. Nomba fires a webhook. We classify it as paid, underpayment, or overpayment."
              code={`// Webhook Callback Triggered\n{\n  "event": "virtual_account.funded",\n  "data": {\n    "amount_kobo": 500000\n  }\n}`}
            />
            <StepCard
              num="03"
              title="Automated Split routing"
              desc="The payment is immediately split into destinations (seller, platform fee, rider) within the same settlement cycle."
              code={`"splits": [\n  { "party": "seller", "percentage": 85 },\n  { "party": "platform", "percentage": 10 },\n  { "party": "rider", "percentage": 5 }\n]`}
            />
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 4 — OPERATIONS HUB
        ════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          <div className="lg:col-span-5 space-y-6 order-last lg:order-first">
            <FadeSection>
              <LiveMockDashboard />
            </FadeSection>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <FadeSection className="space-y-4">
              <p className="text-xs font-mono font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Operations Hub</p>
              <h2 className="text-3xl sm:text-4xl font-bold font-display leading-tight" style={{ color: "var(--text-primary)" }}>
                Consolidated ledger visibility.
              </h2>
              <p className="text-sm sm:text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                Monitor live order payments, split execution cycles, and incoming callback webhooks. Spot underpayments or overpayments immediately in an exceptions panel, and trigger one-click refunds.
              </p>
              <ul className="space-y-3.5 text-sm font-mono">
                {["Real-time webhook callback timeline", "Idempotency-locked ledger databases", "One-click exceptions handling queue"].map(item => (
                  <li key={item} className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 shrink-0" style={{ color: "var(--text-brand)" }} />
                    <span style={{ color: "var(--text-secondary)" }}>{item}</span>
                  </li>
                ))}
              </ul>
            </FadeSection>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 5 — ENGINEERING FIRST
        ════════════════════════════════════════════════════════════════ */}
        <section className="space-y-8">
          <FadeSection className="text-center max-w-2xl mx-auto space-y-4">
            <p className="text-xs font-mono font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Security & Reliability</p>
            <h2 className="text-3xl sm:text-4xl font-bold font-display" style={{ color: "var(--text-primary)" }}>Engineering-first reliability</h2>
            <p className="text-sm sm:text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Designed as robust financial infrastructure. Every endpoint security parameter is optimized for production marketplaces.
            </p>
          </FadeSection>

          <FadeSection className="max-w-3xl mx-auto">
            {/* Tabs */}
            <div className="flex mb-6 overflow-x-auto" style={{ borderBottom: "1px solid var(--border)" }} role="tablist" aria-label="Engineering features">
              {[
                { id: "hmac", label: "HMAC Signatures", icon: Shield },
                { id: "idempotency", label: "Idempotency Rules", icon: Key },
                { id: "lookup", label: "Lookup Verifications", icon: Search }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls={`tabpanel-${tab.id}`}
                    tabIndex={isActive ? 0 : -1}
                    className="flex items-center gap-2 px-6 py-4 text-xs font-mono font-bold border-b-2 transition-all duration-200 cursor-pointer whitespace-nowrap focus:outline-none focus:ring-2 focus:ring-[#16A97B]/50 focus:ring-offset-2 focus:ring-offset-transparent"
                    style={{
                      borderBottomColor: isActive ? "var(--brand)" : "transparent",
                      color: isActive ? "var(--text-brand)" : "var(--text-muted)",
                      background: isActive ? "var(--bg-glass)" : "transparent",
                    }}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            <div
              className="min-h-[240px] rounded-2xl backdrop-blur-sm p-6 transition-all duration-300"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
              role="tabpanel"
              id={`tabpanel-${activeTab}`}
              aria-labelledby={`tab-${activeTab}`}
            >
              {activeTab === "hmac" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold font-display" style={{ color: "var(--text-primary)" }}>Inbound Webhook Verification</h4>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Verify every event payload. We calculate a SHA-256 HMAC of concatenated request items and compare using a timing-safe checker.
                  </p>
                  <CodeSnippet code={`const hashingPayload = [\n  event_type, requestId, data.merchant.userId, \n  data.transaction.transactionId, timestamp\n].join(":");\n\nconst hash = crypto.createHmac("sha256", secret)\n  .update(hashingPayload).digest("base64");`} />
                </div>
              )}
              {activeTab === "idempotency" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold font-display" style={{ color: "var(--text-primary)" }}>Double-Payment Prevention</h4>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Webhooks can fire multiple times. We prevent double split payouts by applying a database-level uniqueness constraint.
                  </p>
                  <CodeSnippet code={`// Enforced at database table level\nALTER TABLE webhook_events \n  ADD CONSTRAINT unique_request_id UNIQUE (request_id);\n\n// Returns 200 immediately if request_id has already been processed.`} />
                </div>
              )}
              {activeTab === "lookup" && (
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold font-display" style={{ color: "var(--text-primary)" }}>Recipient Account Lookups</h4>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Sending splits to wrong account numbers is catastrophic. We query Nomba's account-lookup API to confirm the resolved bank name matches prior to routing.
                  </p>
                  <CodeSnippet code={`// Nomba API validation call\nGET /v1/accounts/lookup\n  ?account_number=9900281721&bank_code=035\n\n→ { "status": "success", "account_name": "WEMA/JUMIA-SELLER" }`} />
                </div>
              )}
            </div>
          </FadeSection>
        </section>

        {/* ════════════════════════════════════════════════════════════════
            SECTION 6 — CTA FOOTER with Enhanced Glassmorphism
        ════════════════════════════════════════════════════════════════ */}
        <section className="pt-8">
          <FadeSection>
            <div
              className="relative rounded-3xl p-8 md:p-16 text-center space-y-8 overflow-hidden transition-all duration-500"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid rgba(22,169,123,0.25)",
                boxShadow: "var(--shadow-card)",
              }}
            >
              {/* Glow blob */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-b from-[#16A97B]/[0.04] to-transparent pointer-events-none" />

              <div className="relative space-y-6 max-w-xl mx-auto">
                <div
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono"
                  style={{ background: "rgba(22,169,123,0.10)", border: "1px solid rgba(22,169,123,0.30)", color: "var(--text-brand)" }}
                >
                  <Lock className="w-3.5 h-3.5" />
                  Production-Ready Infrastructure
                </div>
                <h2 className="text-3xl md:text-5xl font-bold font-display tracking-tight leading-tight"
                    style={{ color: "var(--text-primary)" }}>
                  Ready to wire your marketplace?
                </h2>
                <p className="text-sm sm:text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  Connect your platform to modern virtual account infrastructure. NairaRails doesn't replace your app logic —{" "}
                  <strong style={{ color: "var(--text-primary)" }}>it replaces the spreadsheets they run on.</strong>
                </p>
              </div>

              <div className="relative flex flex-col sm:flex-row items-center gap-4 justify-center">
                <button
                  type="button"
                  onClick={() => navigate("/signup")}
                  className="inline-flex items-center gap-3 px-10 py-5 text-lg bg-[#16A97B] hover:bg-[#128a64] text-black font-semibold rounded-xl shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#16A97B] focus:ring-offset-2 focus:ring-offset-transparent w-full sm:w-auto"
                  aria-label="Get API access"
                >
                  Get API Access
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>

              <div
                className="relative grid grid-cols-3 gap-6 max-w-md mx-auto pt-8 font-mono text-[10px]"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div className="text-center space-y-2">
                  <div className="text-lg font-bold font-display" style={{ color: "var(--text-brand)" }}>1 API Call</div>
                  <div style={{ color: "var(--text-muted)" }}>to integrate</div>
                </div>
                <div className="text-center space-y-2">
                  <div className="text-lg font-bold font-display" style={{ color: "var(--text-primary)" }}>&lt; 1 Second</div>
                  <div style={{ color: "var(--text-muted)" }}>settlement lag</div>
                </div>
                <div className="text-center space-y-2">
                  <div className="text-lg font-bold font-display" style={{ color: "var(--text-primary)" }}>Automatic</div>
                  <div style={{ color: "var(--text-muted)" }}>reconciliation</div>
                </div>
              </div>
            </div>
          </FadeSection>
        </section>

      </div>
    </div>
  );
}

