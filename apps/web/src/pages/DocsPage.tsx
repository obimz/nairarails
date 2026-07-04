/**
 * DocsPage.tsx — NairaRails API Reference
 *
 * Sidebar navigation + right-hand content panel.
 * All endpoint shapes are taken directly from the actual implementation.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, Check, ChevronDown, ChevronRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DocSection {
  id: string;
  label: string;
  children?: { id: string; label: string }[];
}

const NAV: DocSection[] = [
  { id: "overview",     label: "Overview" },
  { id: "auth",         label: "Authentication" },
  {
    id: "orders",
    label: "Orders",
    children: [
      { id: "orders-create", label: "Create order" },
      { id: "orders-list",   label: "List orders" },
      { id: "orders-recon",  label: "Reconciliation status" },
    ],
  },
  {
    id: "webhooks",
    label: "Webhooks",
    children: [
      { id: "webhooks-inbound",   label: "Inbound event" },
      { id: "webhooks-signature", label: "Signature verification" },
      { id: "webhooks-outbound",  label: "Outbound notification" },
    ],
  },
  {
    id: "exceptions",
    label: "Exceptions",
    children: [
      { id: "exceptions-list",   label: "List exceptions" },
      { id: "exceptions-refund", label: "Refund excess" },
    ],
  },
  { id: "errors",  label: "Errors" },
  { id: "amounts", label: "Amounts & Units" },
];

// ─── Copy button ──────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="absolute top-3 right-3 p-1.5 rounded-lg transition-all duration-150 opacity-60 hover:opacity-100"
      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
      aria-label="Copy code"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-green-400" />
        : <Copy className="w-3.5 h-3.5" style={{ color: "var(--text-muted)" }} />}
    </button>
  );
}

// ─── Code block ───────────────────────────────────────────────────────────────

function Code({ children, lang = "" }: { children: string; lang?: string }) {
  return (
    <div className="relative rounded-xl overflow-hidden my-4" style={{ background: "var(--bg-base)", border: "1px solid var(--border)" }}>
      {lang && (
        <div className="px-4 py-2 text-[10px] font-mono uppercase tracking-widest"
             style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)", color: "var(--text-muted)" }}>
          {lang}
        </div>
      )}
      <pre className="p-4 text-[12px] font-mono leading-relaxed overflow-x-auto whitespace-pre" style={{ color: "var(--text-brand)" }}>
        {children}
      </pre>
      <CopyButton text={children} />
    </div>
  );
}

// ─── Method badge ─────────────────────────────────────────────────────────────

function Method({ method }: { method: "GET" | "POST" | "DELETE" }) {
  const colors = {
    GET:    "bg-sky-500/15 text-sky-400 border-sky-500/30",
    POST:   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    DELETE: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-mono font-bold border ${colors[method]}`}>
      {method}
    </span>
  );
}

// ─── Endpoint heading ─────────────────────────────────────────────────────────

function Endpoint({ method, path, desc }: { method: "GET" | "POST" | "DELETE"; path: string; desc: string }) {
  return (
    <div className="rounded-xl p-4 mb-6" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        <Method method={method} />
        <code className="text-sm font-mono font-semibold" style={{ color: "var(--text-primary)" }}>{path}</code>
      </div>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{desc}</p>
    </div>
  );
}

// ─── Field table ──────────────────────────────────────────────────────────────

function FieldTable({ fields }: { fields: { name: string; type: string; required?: boolean; desc: string }[] }) {
  return (
    <div className="rounded-xl overflow-hidden my-4" style={{ border: "1px solid var(--border)" }}>
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
            {["Field", "Type", "Description"].map((h) => (
              <th key={h} className="px-4 py-2.5 text-left font-semibold" style={{ color: "var(--text-muted)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((f, i) => (
            <tr key={f.name} style={{ borderTop: i > 0 ? "1px solid var(--border)" : "none", background: "var(--bg-surface)" }}>
              <td className="px-4 py-2.5">
                <code className="font-mono" style={{ color: "var(--text-brand)" }}>{f.name}</code>
                {f.required && <span className="ml-1.5 text-red-400 text-[10px]">required</span>}
              </td>
              <td className="px-4 py-2.5 font-mono" style={{ color: "var(--text-muted)" }}>{f.type}</td>
              <td className="px-4 py-2.5" style={{ color: "var(--text-secondary)" }}>{f.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section anchor wrapper ───────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 mb-16">
      <h2 className="text-2xl font-bold mb-6 pb-3" style={{ color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-24 mb-10">
      <h3 className="text-lg font-semibold mb-4" style={{ color: "var(--text-primary)" }}>{title}</h3>
      {children}
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed mb-4" style={{ color: "var(--text-secondary)" }}>{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 my-4 text-sm leading-relaxed"
         style={{ background: "rgba(22,169,123,0.08)", border: "1px solid rgba(22,169,123,0.25)", color: "var(--text-secondary)" }}>
      <strong style={{ color: "var(--text-brand)" }}>Note: </strong>{children}
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 my-4 text-sm leading-relaxed"
         style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", color: "var(--text-secondary)" }}>
      <strong className="text-amber-400">Warning: </strong>{children}
    </div>
  );
}


// ─── Doc content ──────────────────────────────────────────────────────────────

function DocContent() {
  return (
    <div>

      {/* Overview */}
      <Section id="overview" title="Overview">
        <P>
          NairaRails is programmable payment infrastructure for Nigerian marketplace commerce.
          Every order gets its own unique virtual account number (NUBAN) backed by Nomba.
          When a buyer pays, a webhook fires and NairaRails automatically matches the payment,
          classifies it, and executes split settlement to all parties in the same cycle.
        </P>
        <P>Base URL for all API calls:</P>
        <Code lang="bash">{`https://your-nairarails-deployment.railway.app`}</Code>
        <P>All endpoints are versioned under <code className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-brand)" }}>/api/v1/</code>. Amounts are always in <strong>kobo</strong> (₦1 = 100 kobo) to avoid floating point errors.</P>
      </Section>

      {/* Authentication */}
      <Section id="auth" title="Authentication">
        <P>
          All marketplace-facing routes require an <code className="font-mono text-xs px-1 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-brand)" }}>x-api-key</code> header.
          Your API key is issued once at signup and prefixed <code className="font-mono text-xs px-1 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-brand)" }}>nrk_live_</code>.
        </P>
        <Code lang="http">{`GET /api/v1/orders\nx-api-key: nrk_live_your_key_here`}</Code>
        <P>Routes that do not require an API key:</P>
        <FieldTable fields={[
          { name: "POST /api/v1/merchants/signup", type: "public", desc: "Issues a new API key — cannot have one yet" },
          { name: "POST /api/v1/webhooks/nomba",   type: "public", desc: "Authenticated by Nomba HMAC signature, not API key" },
          { name: "GET /health",                   type: "public", desc: "Health check" },
        ]} />
        <Note>Each merchant only sees their own orders, exceptions, and dashboard stats. API keys are scoped to a single merchant account.</Note>
      </Section>

      {/* Orders */}
      <Section id="orders" title="Orders">

        <SubSection id="orders-create" title="Create Order">
          <Endpoint method="POST" path="/api/v1/orders" desc="Create a new order and provision a unique virtual account (NUBAN) for it via Nomba. The buyer pays to the returned account number." />
          <h4 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Request body</h4>
          <FieldTable fields={[
            { name: "order_ref",             type: "string",   required: true,  desc: "Your stable order identifier. Alphanumeric, hyphens, underscores. Max 64 chars. Must be unique." },
            { name: "customer_name",         type: "string",   required: true,  desc: "Buyer display name. Shown on the virtual account." },
            { name: "customer_email",        type: "string",   required: false, desc: "Buyer email. Optional." },
            { name: "expected_amount_kobo",  type: "integer",  required: true,  desc: "Expected payment in kobo. ₦5,000 = 500000. No decimals." },
            { name: "currency",              type: "\"NGN\"",  required: false, desc: "Defaults to NGN." },
            { name: "splits",                type: "Split[]",  required: true,  desc: "Array of payout destinations. Percentages must sum to exactly 100." },
          ]} />
          <h4 className="text-sm font-semibold mb-2 mt-6" style={{ color: "var(--text-primary)" }}>Split object</h4>
          <FieldTable fields={[
            { name: "party",          type: "string",  required: true, desc: "Label for this recipient — e.g. \"seller\", \"platform\", \"rider\"." },
            { name: "account_number", type: "string",  required: true, desc: "Nigerian NUBAN — exactly 10 digits." },
            { name: "bank_code",      type: "string",  required: true, desc: "Nomba bank code — use GET /api/v1/admin/banks to look up." },
            { name: "percentage",     type: "integer", required: true, desc: "Whole number 1–100. All splits must sum to 100." },
          ]} />
          <Code lang="json">{`// Request\n{\n  "order_ref": "ord-2041",\n  "customer_name": "Chisom Traders",\n  "expected_amount_kobo": 500000,\n  "currency": "NGN",\n  "splits": [\n    { "party": "seller",   "account_number": "0123456789", "bank_code": "058", "percentage": 85 },\n    { "party": "platform", "account_number": "9876543210", "bank_code": "058", "percentage": 10 },\n    { "party": "rider",    "account_number": "1122334455", "bank_code": "044", "percentage": 5  }\n  ]\n}\n\n// Response 201\n{\n  "order_ref": "ord-2041",\n  "virtual_account_number": "9900012345",\n  "bank_name": "Nomba",\n  "bank_code": "000026",\n  "expected_amount_kobo": 500000,\n  "currency": "NGN",\n  "status": "pending",\n  "created_at": "2026-07-04T01:00:00.000Z"\n}`}</Code>
        </SubSection>

        <SubSection id="orders-list" title="List Orders">
          <Endpoint method="GET" path="/api/v1/orders" desc="List all orders for your merchant account, newest first. Supports status and date range filtering." />
          <h4 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Query parameters</h4>
          <FieldTable fields={[
            { name: "status",    type: "string", desc: "Filter by status: pending | paid | underpayment | overpayment | unmatched | expired" },
            { name: "date_from", type: "string", desc: "ISO date YYYY-MM-DD. Filter orders created on or after this date (UTC)." },
            { name: "date_to",   type: "string", desc: "ISO date YYYY-MM-DD. Filter orders created on or before this date (UTC)." },
            { name: "page",      type: "integer", desc: "Page number, default 1." },
            { name: "page_size", type: "integer", desc: "Results per page, default 20, max 100." },
          ]} />
          <Code lang="json">{`// Response 200\n{\n  "results": [\n    {\n      "order_ref": "ord-2041",\n      "customer_name": "Chisom Traders",\n      "expected_amount_kobo": 500000,\n      "received_amount_kobo": 500000,\n      "status": "paid",\n      "virtual_account_number": "9900012345",\n      "created_at": "2026-07-04T01:00:00.000Z"\n    }\n  ],\n  "page": 1,\n  "page_size": 20,\n  "total_count": 1\n}`}</Code>
        </SubSection>

        <SubSection id="orders-recon" title="Reconciliation Status">
          <Endpoint method="GET" path="/api/v1/orders/:order_ref/reconciliation" desc="Full reconciliation detail for a single order: payment classification, split execution state for each party, and the complete audit trail." />
          <Code lang="json">{`// Response 200\n{\n  "order_ref": "ord-2041",\n  "virtual_account_number": "9900012345",\n  "expected_amount_kobo": 500000,\n  "received_amount_kobo": 480000,\n  "status": "underpayment",\n  "shortfall_kobo": 20000,\n  "excess_kobo": 0,\n  "splits_executed": false,\n  "splits": [\n    { "party": "seller",   "percentage": 85, "amount_paid_kobo": null, "status": "pending", "nomba_transfer_ref": null },\n    { "party": "platform", "percentage": 10, "amount_paid_kobo": null, "status": "pending", "nomba_transfer_ref": null },\n    { "party": "rider",    "percentage": 5,  "amount_paid_kobo": null, "status": "pending", "nomba_transfer_ref": null }\n  ],\n  "audit_trail": [\n    { "event": "va_created",       "timestamp": "2026-07-04T01:00:00.000Z" },\n    { "event": "payment_received", "amount_kobo": 480000, "timestamp": "2026-07-04T01:05:12.000Z" },\n    { "event": "classified",       "detail": "underpayment: shortfall 20000 kobo", "timestamp": "2026-07-04T01:05:12.000Z" }\n  ]\n}`}</Code>
        </SubSection>
      </Section>

      {/* Webhooks */}
      <Section id="webhooks" title="Webhooks">

        <SubSection id="webhooks-inbound" title="Inbound Event (Nomba → NairaRails)">
          <Endpoint method="POST" path="/api/v1/webhooks/nomba" desc="Receives virtual account funding events from Nomba. Verifies HMAC signature, checks idempotency, classifies the payment, and executes splits. Always returns 200 once the event is safely recorded." />
          <P>You do not call this endpoint — Nomba does. Register your NairaRails deployment URL in the Nomba dashboard as your webhook URL.</P>
          <Code lang="json">{`// Nomba sends (event_type: payment_success, type: vact_transfer)\n{\n  "requestId": "req-uuid-abc-123",\n  "event_type": "payment_success",\n  "data": {\n    "transaction": {\n      "transactionId": "txn_abc123",\n      "type": "vact_transfer",\n      "transactionAmount": 5000,\n      "time": "2026-07-04T01:05:12Z",\n      "responseCode": "00",\n      "aliasAccountReference": "ord-2041"\n    },\n    "merchant": {\n      "userId": "user_001",\n      "walletId": "wallet_001"\n    },\n    "customer": {\n      "senderName": "Emeka Okafor",\n      "accountNumber": "0123456789",\n      "bankCode": "058"\n    }\n  }\n}`}</Code>
          <Warn>transactionAmount is in NAIRA (not kobo) in Nomba's webhook payload. NairaRails converts to kobo internally by multiplying by 100.</Warn>
          <Note>aliasAccountReference maps to your order_ref. This is set as accountRef when the virtual account is created, so no secondary lookup is needed.</Note>
        </SubSection>

        <SubSection id="webhooks-signature" title="Signature Verification">
          <P>Every inbound webhook is verified before any business logic runs. Nomba signs events using HMAC-SHA256 over a colon-joined field string.</P>
          <Code lang="text">{`Fields (joined with \":\" in this exact order):\n  event_type\n  requestId\n  data.merchant.userId\n  data.merchant.walletId\n  data.transaction.transactionId\n  data.transaction.type\n  data.transaction.time\n  data.transaction.responseCode  (empty string if absent)\n  nomba-timestamp header`}</Code>
          <Code lang="typescript">{`const payload = [\n  event_type, requestId,\n  merchant.userId, merchant.walletId,\n  transaction.transactionId, transaction.type,\n  transaction.time, transaction.responseCode ?? \"\",\n  headers[\"nomba-timestamp\"],\n].join(\":\");\n\nconst expected = crypto\n  .createHmac(\"sha256\", process.env.NOMBA_WEBHOOK_SECRET)\n  .update(payload)\n  .digest(\"base64\");\n\n// Timing-safe — never use === for crypto comparison\ncrypto.timingSafeEqual(\n  Buffer.from(expected),\n  Buffer.from(headers[\"nomba-signature\"])\n);`}</Code>
        </SubSection>

        <SubSection id="webhooks-outbound" title="Outbound Notification (NairaRails → Your Server)">
          <P>After each payment is classified, NairaRails POSTs a <code className="font-mono text-xs px-1 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-brand)" }}>payment.classified</code> event to your registered <code className="font-mono text-xs px-1 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-brand)" }}>webhookUrl</code>. Fire-and-forget — a failed delivery never blocks the inbound handler.</P>
          <Code lang="json">{`// POST to your webhookUrl\n{\n  "event": "payment.classified",\n  "order_ref": "ord-2041",\n  "status": "paid",\n  "received_amount_kobo": 500000,\n  "expected_amount_kobo": 500000,\n  "splits_executed": true,\n  "timestamp": "2026-07-04T01:05:12.000Z"\n}`}</Code>
          <P>Register your webhook URL at signup or update it later. Your server should return 2xx — NairaRails logs non-2xx but does not retry.</P>
        </SubSection>
      </Section>

      {/* Exceptions */}
      <Section id="exceptions" title="Exceptions">
        <P>Exceptions are orders in <code className="font-mono text-xs px-1 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-brand)" }}>underpayment</code>, <code className="font-mono text-xs px-1 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-brand)" }}>overpayment</code>, or <code className="font-mono text-xs px-1 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-brand)" }}>unmatched</code> status that require ops attention.</P>

        <SubSection id="exceptions-list" title="List Exceptions">
          <Endpoint method="GET" path="/api/v1/exceptions" desc="List all open exceptions for your merchant account." />
          <FieldTable fields={[
            { name: "type", type: "string", desc: "Filter by type: underpayment | overpayment | unmatched" },
          ]} />
          <Code lang="json">{`// Response 200\n{\n  "results": [\n    {\n      "order_ref": "ord-2041",\n      "type": "overpayment",\n      "expected_amount_kobo": 500000,\n      "received_amount_kobo": 520000,\n      "shortfall_kobo": 0,\n      "excess_kobo": 20000,\n      "raised_at": "2026-07-04T01:05:12.000Z",\n      "resolved": false,\n      "resolved_at": null\n    }\n  ],\n  "total_count": 1\n}`}</Code>
        </SubSection>

        <SubSection id="exceptions-refund" title="Refund Excess">
          <Endpoint method="POST" path="/api/v1/exceptions/:order_ref/refund-excess" desc="Refund the excess amount from an overpayment back to the original sender. Looks up the sender's account (from webhook data), transfers the excess kobo, and marks the exception resolved." />
          <Warn>The sender account details must have been captured from the inbound webhook. If the webhook did not include customer.accountNumber, the refund will fail.</Warn>
          <Code lang="json">{`// Response 200\n{\n  "order_ref": "ord-2041",\n  "refunded_amount_kobo": 20000,\n  "sender_account": "0123456789",\n  "sender_bank": "058",\n  "status": "success",\n  "nomba_transfer_ref": "txn_refund_xyz"\n}`}</Code>
        </SubSection>
      </Section>

      {/* Errors */}
      <Section id="errors" title="Errors">
        <P>All errors follow a consistent shape:</P>
        <Code lang="json">{`{\n  "error": {\n    "code":    "DUPLICATE_ORDER_REF",\n    "message": "Order ref 'ord-2041' already exists",\n    "field":   "order_ref"   // present on validation errors\n  }\n}`}</Code>
        <FieldTable fields={[
          { name: "400 VALIDATION_ERROR",    type: "4xx", desc: "Request body failed schema validation. field identifies the offending key." },
          { name: "401 MISSING_API_KEY",     type: "4xx", desc: "No x-api-key header on a protected route." },
          { name: "401 INVALID_API_KEY",     type: "4xx", desc: "The provided API key is not valid." },
          { name: "401 INVALID_WEBHOOK_SIGNATURE", type: "4xx", desc: "Nomba webhook HMAC verification failed." },
          { name: "404 ORDER_NOT_FOUND",     type: "4xx", desc: "Order ref does not exist or belongs to another merchant." },
          { name: "409 DUPLICATE_ORDER_REF", type: "4xx", desc: "order_ref already exists — use a different ref." },
          { name: "422 VALIDATION_ERROR",    type: "4xx", desc: "splits percentages do not sum to 100, or other semantic validation failure." },
          { name: "500 INTERNAL_ERROR",      type: "5xx", desc: "Unexpected server error." },
        ]} />
      </Section>

      {/* Amounts */}
      <Section id="amounts" title="Amounts & Units">
        <P>All monetary amounts in the NairaRails API are in <strong>kobo</strong> — the smallest unit of the Nigerian naira.</P>
        <Code lang="text">{`₦1.00  =  100 kobo\n₦50.00 =  5,000 kobo\n₦5,000 =  500,000 kobo\n\n// Always integers — no decimals accepted\nexpected_amount_kobo: 500000   ✓\nexpected_amount_kobo: 5000.00  ✗  (rejected)`}</Code>
        <Note>Nomba's webhook delivers transactionAmount in naira (not kobo). NairaRails converts by multiplying by 100 before any comparison or storage. Your API always receives and returns kobo.</Note>
      </Section>

    </div>
  );
}


// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ active, onSelect }: { active: string; onSelect: (id: string) => void }) {
  const [open, setOpen] = React.useState<Record<string, boolean>>({ orders: true, webhooks: true, exceptions: true });

  function toggle(id: string) { setOpen((o) => ({ ...o, [id]: !o[id] })); }

  return (
    <nav className="w-60 shrink-0" aria-label="Docs navigation">
      <div className="sticky top-20 space-y-0.5">
        {NAV.map((section) => (
          <div key={section.id}>
            <button
              type="button"
              onClick={() => { onSelect(section.id); if (section.children) toggle(section.id); }}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 text-left cursor-pointer"
              style={{
                background: active === section.id ? "rgba(22,169,123,0.10)" : "transparent",
                color:      active === section.id ? "var(--brand)" : "var(--text-secondary)",
              }}
            >
              <span>{section.label}</span>
              {section.children && (
                open[section.id]
                  ? <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                  : <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
            {section.children && open[section.id] && (
              <div className="ml-3 mt-0.5 space-y-0.5 pl-3" style={{ borderLeft: "1px solid var(--border)" }}>
                {section.children.map((child) => (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => onSelect(child.id)}
                    className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors duration-150 cursor-pointer"
                    style={{
                      color: active === child.id ? "var(--brand)" : "var(--text-muted)",
                      background: active === child.id ? "rgba(22,169,123,0.08)" : "transparent",
                    }}
                  >
                    {child.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function DocsPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = React.useState("overview");

  function scrollTo(id: string) {
    setActiveSection(id);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Update active section on scroll
  React.useEffect(() => {
    const allIds = NAV.flatMap((s) => [s.id, ...(s.children?.map((c) => c.id) ?? [])]);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target.id) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    allIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>

      {/* Header */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-md"
              style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-glass)" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 md:px-8 py-4">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-sm transition-colors duration-150"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div style={{ width: "1px", height: "16px", background: "var(--border)" }} />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-[#16A97B] flex items-center justify-center">
                <span className="text-black text-xs font-bold">₦</span>
              </div>
              <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>NairaRails</span>
              <span className="text-xs px-2 py-0.5 rounded-full font-mono"
                    style={{ background: "var(--bg-elevated)", color: "var(--text-muted)", border: "1px solid var(--border)" }}>
                API Reference
              </span>
            </div>
          </div>
          <button type="button" onClick={() => navigate("/signup")}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#16A97B] hover:bg-[#128a64] text-black font-semibold rounded-lg text-sm transition-colors duration-150">
            Get API Access
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-10 flex gap-10">

        {/* Sidebar — hidden on mobile */}
        <div className="hidden lg:block">
          <Sidebar active={activeSection} onSelect={scrollTo} />
        </div>

        {/* Content */}
        <main className="flex-1 min-w-0 max-w-3xl">
          <div className="mb-10">
            <h1 className="text-4xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>API Reference</h1>
            <p className="text-base" style={{ color: "var(--text-secondary)" }}>
              Complete reference for the NairaRails REST API. All amounts are in kobo.
            </p>
          </div>
          <DocContent />
        </main>
      </div>
    </div>
  );
}
