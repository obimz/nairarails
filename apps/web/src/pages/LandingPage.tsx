/**
 * LandingPage.tsx — NairaRails marketing page.
 * Content accurate to the actual system: per-order NUBANs via Nomba,
 * HMAC webhook verification, split settlement, exception handling.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowRight, ChevronDown, Check, Shield, Key, Search,
  Zap, Lock, AlertTriangle, Webhook, SplitSquareVertical, GitMerge,
} from "lucide-react";
import { PaymentFlowDiagram } from "../components/PaymentFlowDiagram.js";
import { LogoMark, LogoLockup } from "../components/Logo.js";
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
      trigger: el, start: "top 85%", once: true,
      onEnter: () => {
        gsap.to(obj.current, {
          val: target, duration: 2.2, ease: "power2.out",
          onUpdate: () => {
            el.textContent = prefix + Math.floor(obj.current.val).toLocaleString("en-NG");
          },
        });
      },
    });
  }, [target, prefix]);
  return <span ref={ref} className="font-mono font-bold" style={{ color: "var(--text-primary)" }}>0</span>;
}

// ─── Fade in on scroll ────────────────────────────────────────────────────────
function FadeSection({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!ref.current) return;
    gsap.fromTo(ref.current, { opacity: 0, y: 24 }, {
      opacity: 1, y: 0, duration: 0.8, ease: "power2.out",
      scrollTrigger: { trigger: ref.current, start: "top 80%", once: true },
    });
  }, []);
  return <div ref={ref} className={className} style={{ opacity: 0 }}>{children}</div>;
}

// ─── Inline code block ────────────────────────────────────────────────────────
function CodeBlock({ code }: { code: string }) {
  return (
    <div className="rounded-xl overflow-x-auto mt-4" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
      <pre className="p-4 text-[11px] font-mono leading-relaxed whitespace-pre select-all" style={{ color: "var(--text-brand)" }}>
        {code}
      </pre>
    </div>
  );
}

// ─── Step card ────────────────────────────────────────────────────────────────
function StepCard({ num, icon, title, desc, code }: {
  num: string; icon: React.ReactNode; title: string; desc: string; code: string;
}) {
  return (
    <FadeSection>
      <div
        className="group relative rounded-2xl p-6 h-full transition-all duration-300 hover:border-[rgba(22,169,123,0.3)]"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
               style={{ background: "rgba(22,169,123,0.10)", border: "1px solid rgba(22,169,123,0.20)", color: "var(--brand)" }}>
            {icon}
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest mb-0.5" style={{ color: "var(--text-muted)" }}>Step {num}</p>
            <h3 className="text-base font-semibold group-hover:text-[#16A97B] transition-colors duration-200" style={{ color: "var(--text-primary)" }}>
              {title}
            </h3>
          </div>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{desc}</p>
        <CodeBlock code={code} />
      </div>
    </FadeSection>
  );
}


// ─── Live mock dashboard ──────────────────────────────────────────────────────
interface MockTx {
  id: string;
  status: "paid" | "underpayment" | "overpayment";
  received: number;
  expected: number;
  time: string;
}

function LiveMockDashboard() {
  const [txs, setTxs] = React.useState<MockTx[]>([
    { id: "ord-492", status: "paid",         received: 50000,  expected: 50000,  time: "Just now" },
    { id: "ord-491", status: "underpayment", received: 48000,  expected: 50000,  time: "1 min ago" },
    { id: "ord-490", status: "overpayment",  received: 52000,  expected: 50000,  time: "3 min ago" },
    { id: "ord-489", status: "paid",         received: 125000, expected: 125000, time: "5 min ago" },
  ]);
  const [totalExpected, setTotalExpected] = React.useState(275000);
  const [totalReceived, setTotalReceived] = React.useState(270000);

  React.useEffect(() => {
    const interval = setInterval(() => {
      const statuses: MockTx["status"][] = ["paid", "paid", "paid", "underpayment", "overpayment"];
      const status = statuses[Math.floor(Math.random() * statuses.length)]!;
      const expected = [15000, 35000, 50000, 80000, 125000][Math.floor(Math.random() * 5)]!;
      const received = status === "underpayment" ? expected - 2000
                     : status === "overpayment"  ? expected + 3000
                     : expected;
      const newTx: MockTx = {
        id:  `ord-${Math.floor(100 + Math.random() * 899)}`,
        status, received, expected, time: "Just now",
      };
      setTxs((prev) =>
        [newTx, ...prev.slice(0, 3)].map((t, i) => ({
          ...t, time: i === 0 ? "Just now" : `${i * 2} min ago`,
        }))
      );
      setTotalExpected((p) => p + expected);
      setTotalReceived((p) => p + received);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  const statusStyle: Record<MockTx["status"], string> = {
    paid:         "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    underpayment: "bg-red-500/15 text-red-400 border-red-500/30",
    overpayment:  "bg-purple-500/15 text-purple-400 border-purple-500/30",
  };

  return (
    <div className="rounded-2xl p-6 w-full text-xs"
         style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <div>
          <div className="text-[9px] font-mono uppercase tracking-wider mb-0.5" style={{ color: "var(--text-muted)" }}>Live Webhook Pipeline</div>
          <div className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>NairaRails Console</div>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-[10px]" style={{ color: "var(--text-brand)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#16A97B] animate-pulse" />
          LIVE
        </div>
      </div>
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: "EXPECTED", value: `₦${totalExpected.toLocaleString("en-NG")}`, color: "var(--text-primary)" },
          { label: "RECEIVED", value: `₦${totalReceived.toLocaleString("en-NG")}`, color: "var(--text-brand)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-xl" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div className="text-[9px] font-mono uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>{label}</div>
            <div className="text-sm font-bold font-mono" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>
      {/* Feed */}
      <div className="space-y-2">
        {txs.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between p-2.5 rounded-lg"
               style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2.5">
              <span className="font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{tx.id}</span>
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono border ${statusStyle[tx.status]}`}>
                {tx.status}
              </span>
            </div>
            <div className="text-right">
              <div className="font-mono font-medium" style={{ color: "var(--text-primary)" }}>
                ₦{tx.received.toLocaleString("en-NG")}
              </div>
              <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>{tx.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ─── Main landing page ────────────────────────────────────────────────────────
export function LandingPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = React.useState<"hmac" | "idempotency" | "lookup">("hmac");

  return (
    <div className="relative min-h-screen overflow-x-hidden" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>

      {/* Background glows */}
      <div className="fixed inset-0 auth-bg opacity-60 pointer-events-none z-0" />
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none z-0"
           style={{ background: "radial-gradient(circle, rgba(22,169,123,0.07) 0%, transparent 70%)" }} />

      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-md"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-glass)" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 md:px-8 py-4">
          <div className="flex items-center gap-2.5">
            <LogoLockup size={32} textSize="text-lg" />
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <button type="button" onClick={() => navigate("/docs")}
              className="text-sm font-medium transition-colors duration-150 px-3 py-2 rounded-lg"
              style={{ color: "var(--text-secondary)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}>
              Docs
            </button>
            <button type="button" onClick={() => navigate("/signup")}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#16A97B] hover:bg-[#128a64] text-black font-semibold rounded-xl text-sm transition-all duration-200 shadow-lg shadow-emerald-500/20">
              Get API Access <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20 md:space-y-28 pb-24">

        {/* ══════════════════════════════════════════════════════════════════
            HERO
        ══════════════════════════════════════════════════════════════════ */}
        <section className="pt-12 md:pt-20 flex flex-col items-center text-center space-y-8">
          <FadeSection className="space-y-6 max-w-4xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono"
                 style={{ background: "rgba(22,169,123,0.10)", border: "1px solid rgba(22,169,123,0.25)", color: "var(--text-brand)" }}>
              <Zap className="w-3.5 h-3.5" />
              Built on Nomba Virtual Accounts · Hackathon 2026
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A97B] animate-pulse" />
            </div>

            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold leading-tight tracking-tight"
                style={{ color: "var(--text-primary)" }}>
              Every marketplace order<br />
              gets its own{" "}
              <span style={{ color: "var(--text-brand)" }}>bank account.</span>
            </h1>

            <p className="text-base leading-relaxed max-w-2xl mx-auto" style={{ color: "var(--text-secondary)" }}>
              NairaRails sits between your checkout and Nomba. One API call creates a unique virtual
              account per order. The moment a buyer pays, the webhook fires, classifies the payment,
              and splits funds to seller, platform, and rider —{" "}
              <strong style={{ color: "var(--text-primary)" }}>automatically, in milliseconds.</strong>
            </p>
          </FadeSection>

          <FadeSection className="flex flex-col sm:flex-row items-center gap-4 justify-center">
            <button type="button" onClick={() => navigate("/signup")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-[#16A97B] hover:bg-[#128a64] text-black font-semibold rounded-xl shadow-lg shadow-emerald-500/25 transition-all duration-200 text-base">
              Get API Access <ArrowRight className="w-5 h-5" />
            </button>
            <a href="#how-it-works"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-sm font-semibold transition-all duration-200"
              style={{ background: "var(--bg-glass)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
              See how it works <ChevronDown className="w-4 h-4" />
            </a>
          </FadeSection>

          <FadeSection className="w-full pt-4">
            <PaymentFlowDiagram />
          </FadeSection>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            THE PROBLEM
        ══════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          <div className="lg:col-span-5 space-y-6">
            <FadeSection>
              <p className="text-xs font-mono font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                The cost of spreadsheet plumbing
              </p>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight mt-2" style={{ color: "var(--text-primary)" }}>
                ₦<Counter target={35560000000} />
              </h2>
              <p className="leading-relaxed text-sm" style={{ color: "var(--text-secondary)" }}>
                Lost to publicly documented reconciliation failures in Nigeria between 2023 and 2024.
                Every marketplace that reconciles manually is leaking margin on every edge case.
              </p>
              <div className="p-4 rounded-xl mt-8"
                   style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-mono leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    <strong className="text-amber-500">Sept 2024:</strong> NIBSS lag posted ₦13.66B with no
                    corresponding debit. Nobody caught it at the application layer until Monday morning.
                  </p>
                </div>
              </div>
            </FadeSection>
          </div>

          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <FadeSection>
              <div className="rounded-2xl p-6 h-full"
                   style={{ background: "var(--bg-surface)", border: "1px solid rgba(239,68,68,0.25)", boxShadow: "var(--shadow-card)" }}>
                <p className="text-[10px] font-mono uppercase font-bold mb-4 tracking-wider text-red-500">Without NairaRails</p>
                <ul className="space-y-4 text-xs" style={{ color: "var(--text-secondary)" }}>
                  {[
                    "One shared account receives all transfers",
                    "Finance officer matches sender name to order manually",
                    "Splits run in a spreadsheet the next morning",
                    "Underpayments credited in full — shortfall disappears silently",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <span className="text-red-500 font-bold shrink-0 mt-0.5">✕</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeSection>
            <FadeSection>
              <div className="rounded-2xl p-6 h-full"
                   style={{ background: "var(--bg-surface)", border: "1px solid rgba(22,169,123,0.30)", boxShadow: "var(--shadow-card)" }}>
                <p className="text-[10px] font-mono uppercase font-bold mb-4 tracking-wider" style={{ color: "var(--text-brand)" }}>With NairaRails</p>
                <ul className="space-y-4 text-xs" style={{ color: "var(--text-secondary)" }}>
                  {[
                    "Every order gets a unique NUBAN — payment matches itself",
                    "Webhook fires on settlement, classification is instant",
                    "Splits execute in the same webhook cycle — no batch jobs",
                    "Underpayments held, overpayments quarantined with one-click refund",
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5">
                      <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--text-brand)" }} /> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeSection>
          </div>
        </section>


        {/* ══════════════════════════════════════════════════════════════════
            HOW IT WORKS
        ══════════════════════════════════════════════════════════════════ */}
        <section id="how-it-works" className="space-y-12">
          <FadeSection className="text-center max-w-2xl mx-auto space-y-4">
            <p className="text-xs font-mono font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>The Flow</p>
            <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>How NairaRails works</h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Three steps from order creation to settled funds. No changes to your checkout flow.
            </p>
          </FadeSection>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StepCard
              num="01"
              icon={<GitMerge className="w-5 h-5" />}
              title="Create Order + NUBAN"
              desc="Call POST /api/v1/orders with your order ref, expected amount in kobo, and split config. NairaRails provisions a unique NUBAN via Nomba and returns it. The buyer pays to that account number."
              code={`POST /api/v1/orders\nx-api-key: nrk_live_...\n\n{\n  "order_ref": "ord-2041",\n  "expected_amount_kobo": 500000,\n  "splits": [\n    { "party": "seller",   "percentage": 85,\n      "account_number": "0123456789",\n      "bank_code": "058" },\n    { "party": "platform", "percentage": 10,\n      "account_number": "9876543210",\n      "bank_code": "058" },\n    { "party": "rider",    "percentage": 5,\n      "account_number": "1122334455",\n      "bank_code": "044" }\n  ]\n}\n\n← { "virtual_account_number": "9900012345",\n    "bank_name": "Nomba",\n    "status": "pending" }`}
            />
            <StepCard
              num="02"
              icon={<Webhook className="w-5 h-5" />}
              title="Webhook Reconciliation"
              desc="Nomba fires virtual_account.funded when the buyer pays. NairaRails verifies the HMAC-SHA256 signature, checks idempotency, and classifies: exact match → paid, short → underpayment held, over → overpayment quarantined."
              code={`// Nomba fires POST /api/v1/webhooks/nomba\n// HMAC-SHA256 signature verified first\n\nclassify(expectedKobo, receivedKobo)\n  → "paid"         // exact match\n  → "underpayment" // held, buyer notified\n  → "overpayment"  // excess quarantined\n  → "unmatched"    // no order found\n\n// Idempotency: duplicate requestId\n// returns 200 immediately — no double split`}
            />
            <StepCard
              num="03"
              icon={<SplitSquareVertical className="w-5 h-5" />}
              title="Instant Split Settlement"
              desc="On a valid payment, NairaRails looks up each recipient account name via Nomba, then fires transfers — seller 85%, platform 10%, rider 5% — all in the same webhook cycle. No batch jobs, no next-day cron."
              code={`// Same webhook handler, after classify():\nfor (const split of allocations) {\n  // Verify recipient before moving money\n  const { accountName } =\n    await lookupBankAccount({\n      bankCode, accountNumber\n    });\n\n  await transferToBank({\n    amountKobo: split.amount_kobo,\n    merchantTxRef:\n      \`split_\${orderRef}_\${party}\`\n  });\n}`}
            />
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            OPERATIONS HUB
        ══════════════════════════════════════════════════════════════════ */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16 items-center">
          <div className="lg:col-span-5 order-last lg:order-first">
            <FadeSection><LiveMockDashboard /></FadeSection>
          </div>
          <div className="lg:col-span-7 space-y-6">
            <FadeSection className="space-y-4">
              <p className="text-xs font-mono font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Operations Hub</p>
              <h2 className="text-xl sm:text-2xl font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                Every naira tagged.<br />Every exception visible.
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                The live dashboard shows every order's payment status, every split's execution state,
                and every exception with its current action — underpayment shortfall, overpayment
                with one-click refund, or unmatched payment quarantined for review.
              </p>
              <ul className="space-y-3 text-sm">
                {[
                  "Per-order NUBAN → zero manual payment matching",
                  "Five payment states: paid, underpayment, overpayment, unmatched, duplicate",
                  "Exception queue with one-click overpayment refund",
                  "Full audit trail: every webhook event and fund movement",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 shrink-0" style={{ color: "var(--text-brand)" }} />
                    <span style={{ color: "var(--text-secondary)" }}>{item}</span>
                  </li>
                ))}
              </ul>
            </FadeSection>
          </div>
        </section>


        {/* ══════════════════════════════════════════════════════════════════
            ENGINEERING RELIABILITY
        ══════════════════════════════════════════════════════════════════ */}
        <section className="space-y-8">
          <FadeSection className="text-center max-w-2xl mx-auto space-y-4">
            <p className="text-xs font-mono font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Security & Reliability</p>
            <h2 className="text-xl sm:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Engineering-first infrastructure</h2>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              Every decision in the stack was made with financial correctness in mind.
            </p>
          </FadeSection>

          <FadeSection className="max-w-3xl mx-auto">
            <div className="flex overflow-x-auto" style={{ borderBottom: "1px solid var(--border)" }} role="tablist">
              {([
                { id: "hmac",        label: "HMAC Signatures",   icon: Shield },
                { id: "idempotency", label: "Idempotency",        icon: Key },
                { id: "lookup",      label: "Lookup Verification",icon: Search },
              ] as const).map(({ id, label, icon: Icon }) => (
                <button key={id} type="button"
                  onClick={() => setActiveTab(id)}
                  role="tab" aria-selected={activeTab === id}
                  className="flex items-center gap-2 px-5 py-4 text-xs font-mono font-semibold border-b-2 transition-all duration-200 whitespace-nowrap cursor-pointer"
                  style={{
                    borderBottomColor: activeTab === id ? "var(--brand)" : "transparent",
                    color: activeTab === id ? "var(--text-brand)" : "var(--text-muted)",
                    background: activeTab === id ? "var(--bg-glass)" : "transparent",
                  }}>
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            <div className="rounded-b-2xl p-6 min-h-[220px]"
                 style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderTop: "none" }}>
              {activeTab === "hmac" && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>HMAC-SHA256 Webhook Verification</h4>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Every inbound Nomba webhook is verified before any business logic runs. We build a
                    colon-joined string from nine event fields and compute HMAC-SHA256 with your
                    NOMBA_WEBHOOK_SECRET. Timing-safe comparison — never a string equality check.
                  </p>
                  <div className="rounded-xl overflow-x-auto" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                    <pre className="p-4 text-[11px] font-mono leading-relaxed" style={{ color: "var(--text-brand)" }}>{`const payload = [\n  event_type, requestId,\n  merchant.userId, merchant.walletId,\n  transaction.transactionId, transaction.type,\n  transaction.time, transaction.responseCode ?? "",\n  headers["nomba-timestamp"]\n].join(":");\n\nconst expected = crypto\n  .createHmac("sha256", NOMBA_WEBHOOK_SECRET)\n  .update(payload)\n  .digest("base64");\n\ncrypto.timingSafeEqual(\n  Buffer.from(expected),\n  Buffer.from(headers["nomba-signature"])\n);`}</pre>
                  </div>
                </div>
              )}
              {activeTab === "idempotency" && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>DB-Level Idempotency</h4>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Nomba may fire the same webhook twice. A unique constraint on
                    webhook_events.request_id means the second delivery hits the constraint and
                    returns 200 immediately — the split never fires twice, no money moves twice.
                  </p>
                  <div className="rounded-xl overflow-x-auto" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                    <pre className="p-4 text-[11px] font-mono leading-relaxed" style={{ color: "var(--text-brand)" }}>{`// Database constraint — idempotency key\nUNIQUE CONSTRAINT webhook_events.request_id\n\n// Handler logic:\nconst existing = await prisma.webhookEvent\n  .findUnique({ where: { requestId } });\n\nif (existing) {\n  return res.status(200).json({\n    status: "duplicate_ignored"\n  });\n}\n\n// First delivery only: insert then process`}</pre>
                  </div>
                </div>
              )}
              {activeTab === "lookup" && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Lookup Before Every Transfer</h4>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    Before any split transfer, NairaRails calls Nomba's account lookup API to resolve
                    the account name. Sending to a wrong NUBAN can be irreversible — the verified
                    name is confirmed before any money moves. A failed lookup marks the split failed,
                    never silently credits the wrong account.
                  </p>
                  <div className="rounded-xl overflow-x-auto" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
                    <pre className="p-4 text-[11px] font-mono leading-relaxed" style={{ color: "var(--text-brand)" }}>{`// POST /v1/transfers/bank/lookup\nconst { accountName } = await lookupBankAccount({\n  bankCode:      split.bank_code,\n  accountNumber: split.account_number,\n});\n// accountName confirmed → safe to transfer\n\n// POST /v2/transfers/bank/{subAccountId}\nawait transferToBank({\n  amountKobo:    split.amount_kobo,\n  accountName,   // from lookup — not user input\n  merchantTxRef: \`split_\${orderRef}_\${party}\`,\n});`}</pre>
                  </div>
                </div>
              )}
            </div>
          </FadeSection>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            CTA FOOTER
        ══════════════════════════════════════════════════════════════════ */}
        <section className="pt-4">
          <FadeSection>
            <div className="relative rounded-3xl p-8 md:p-16 text-center space-y-8 overflow-hidden"
                 style={{ background: "var(--bg-surface)", border: "1px solid rgba(22,169,123,0.25)", boxShadow: "var(--shadow-card)" }}>
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full bg-emerald-500/10 blur-[100px] pointer-events-none" />
              <div className="relative space-y-5 max-w-xl mx-auto">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono"
                     style={{ background: "rgba(22,169,123,0.10)", border: "1px solid rgba(22,169,123,0.30)", color: "var(--text-brand)" }}>
                  <Lock className="w-3.5 h-3.5" /> Production-ready infrastructure
                </div>
                <h2 className="text-xl md:text-2xl font-bold tracking-tight leading-tight" style={{ color: "var(--text-primary)" }}>
                  Wire your marketplace<br />in one API call.
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  NairaRails doesn't change your checkout flow.{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    It replaces the spreadsheet your finance team runs after it.
                  </strong>
                </p>
              </div>
              <div className="relative flex flex-col sm:flex-row items-center gap-4 justify-center">
                <button type="button" onClick={() => navigate("/signup")}
                  className="inline-flex items-center gap-3 px-10 py-5 text-base bg-[#16A97B] hover:bg-[#128a64] text-black font-semibold rounded-xl shadow-lg shadow-emerald-500/30 transition-all duration-200 w-full sm:w-auto justify-center">
                  Get API Access <ArrowRight className="w-5 h-5" />
                </button>
                <button type="button" onClick={() => navigate("/docs")}
                  className="inline-flex items-center gap-2 px-8 py-5 rounded-xl text-sm font-semibold transition-all duration-200 w-full sm:w-auto justify-center"
                  style={{ background: "var(--bg-glass)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                  Read the docs
                </button>
              </div>
              <div className="relative grid grid-cols-3 gap-6 max-w-md mx-auto pt-6 font-mono text-[10px]"
                   style={{ borderTop: "1px solid var(--border)" }}>
                {[
                  { val: "1 API Call",    label: "to integrate" },
                  { val: "Real-time",     label: "webhook settlement" },
                  { val: "Zero",          label: "manual reconciliation" },
                ].map(({ val, label }) => (
                  <div key={label} className="text-center space-y-1">
                    <div className="text-base font-bold" style={{ color: "var(--text-brand)" }}>{val}</div>
                    <div style={{ color: "var(--text-muted)" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeSection>
        </section>

      </div>
    </div>
  );
}
