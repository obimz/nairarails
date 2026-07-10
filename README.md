# NairaRails

> Programmable payment infrastructure for Nigerian marketplace commerce — built on Nomba's Virtual Account API.

**Nomba × DevCareer Hackathon 2026 — Build Track: Virtual Accounts as Infrastructure**

---

## The Problem

Nigeria processed **₦1.07 quadrillion** in digital transactions in 2024. Marketplace payments still reconcile in spreadsheets.

A marketplace operator collects into one shared bank account. Every transfer arrives as a sender name and an amount — nothing else. A finance officer spends hours matching payments against open orders. Splits happen the next morning in Excel. When a buyer pays the wrong amount, the discrepancy quietly disappears.

**₦35.56 billion** was lost to publicly documented reconciliation failures in Nigeria between 2023 and 2024.

---

## What NairaRails Does

NairaRails gives every order its own **unique virtual account number (NUBAN)** via Nomba. The moment a buyer pays, a webhook fires and NairaRails takes over:

1. **Matches** the payment to the exact order — zero manual lookup
2. **Classifies** it: exact match, underpayment, or overpayment
3. **Routes** it: splits execute in the same webhook cycle, every kobo accounted for
4. **Reports** it: a live dashboard shows every order, every exception, every naira in real time

No spreadsheets. No batch jobs. No Monday morning surprises.

---

## Live Demo

| Surface | URL |
|---------|-----|
| Frontend (Vercel) | https://nairarails.vercel.app |
| API (Railway) | https://nairarails-api.up.railway.app |
| Health Check | https://nairarails-api.up.railway.app/health |
| Demo API Key | `nrk_live_demo_seed_key` (use in `x-api-key` header) |

**Quick demo flow:**
1. Sign up at `/signup` → verify email → API key issued once
2. `POST /api/v1/orders` with your key → receive a real Nomba NUBAN
3. Send a payment to that NUBAN in the Nomba sandbox
4. Webhook fires → dashboard updates live → splits execute or full settlement transfers
5. Try an underpayment → shortfall flagged, splits blocked
6. Try an overpayment → excess quarantined, one-click refund available

---

## Test Credentials

For judges/testers who want to log in directly instead of signing up:

| Field | Value |
|-------|-------|
| Email | `favitech009@gmail.com` |
| Password | `Favour2009##` |
| API Key | `nrk_live_cbc26c4a3daf5b02abaab1e3d8ceac67557cc9535f1cfc5048bb3849396df672` |

Use the API Key in the `x-api-key` header for direct API calls, or log in with the email/password at `/login` to access the merchant dashboard.

---

## Architecture

```
nairarails/                        pnpm + Turborepo monorepo
├── apps/
│   ├── api/                       Express + TypeScript backend (port 3000)
│   │   ├── src/routes/            orders, webhooks, exceptions, dashboard, auth, admin, support, keys
│   │   ├── src/middleware/        apiKeyAuth, jwtAuth, rateLimiter, errorHandler
│   │   ├── src/integrations/     nombaClient.ts — all outbound Nomba calls
│   │   └── src/lib/              reconciliationCron, ai-tools, notifyMerchant, bankValidator, logger
│   └── web/                       React + Vite dashboard (port 5173)
│       └── src/
│           ├── pages/            Overview, Orders, Exceptions, Settings, Admin, Docs, Onboarding
│           ├── components/       SupportChat, charts, StatusBadge, ThemeToggle, HeroNetworkScene
│           ├── docs/             7 embedded Markdown documentation pages
│           └── lib/              apiFetch, money formatters, supabase client, docsNav
├── packages/
│   ├── shared-types/             Zod schemas — single API contract (FE + BE)
│   ├── webhook-core/             Pure functions: classify, calculateSplits, verifySignature
│   ├── ui/                       Shared React components
│   └── tsconfig/                 Shared TS config
└── turbo.json                    Build orchestration
```

**Package dependency graph:**
```
@nairarails/tsconfig       ← devDependency of all packages/apps
@nairarails/shared-types   ← imported by api, web, webhook-core
@nairarails/webhook-core   ← imported by api (pure logic, zero I/O)
@nairarails/ui             ← shared React components
```

Turborepo enforces build order via `"dependsOn": ["^build"]` — shared packages always build before apps.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces + Turborepo |
| Backend | Express (TypeScript) |
| Validation | Zod — schemas shared between frontend and backend |
| Database | PostgreSQL via Supabase |
| ORM | Prisma |
| Auth | Supabase Auth (email/password + JWT) |
| Frontend | React + Vite, TanStack Query, Tailwind CSS, Recharts |
| Payments | Nomba Virtual Account API + Transfers v2 + Webhooks |
| AI Support | Gemini 2.5 Flash (tool-calling, 7 live-data tools) |
| Rate Limiting | express-rate-limit + Redis |
| Testing | Vitest (27 unit tests across 3 suites) |
| CI/CD | GitHub Actions → Railway (API) + Vercel (Frontend) |

---

## Core Features

### Per-Order Virtual Accounts

Every order gets a unique Nomba NUBAN created via Nomba's **sub-account route** — the only route that triggers webhook delivery. When payment arrives, the system already knows which order it belongs to. There is no matching step.

Sender identity is captured from every webhook payload — `senderName`, `senderAccountNumber`, and `senderBankCode` are stored on the order. This data drives accurate refunds back to the exact account that originally sent the payment.

Order and split records are created atomically before the Nomba VA call. If the VA call fails, the DB rows are rolled back so the same `order_ref` can be retried cleanly — no orphaned data.

### Real-Time Webhook Reconciliation

The reconciliation engine is a **pure function** (`packages/webhook-core`) with zero side effects, fully unit-tested in isolation:

```typescript
export function classify(expectedKobo: number, receivedKobo: number) {
  if (receivedKobo === 0 && expectedKobo > 0) return "unmatched";
  if (receivedKobo === expectedKobo)           return "paid";
  if (receivedKobo < expectedKobo)             return "underpayment";
  return "overpayment";
}
```

Every inbound payment is classified the moment it arrives:

| State | What Happens |
|-------|-------------|
| Exact match | Mark paid → execute splits or settlement → notify merchant |
| Underpayment | Hold funds → calculate shortfall → block splits until resolved |
| Overpayment | Run splits on expected amount only → quarantine excess → one-click refund |
| Unmatched | Quarantine immediately → alert ops → nothing disappears silently |
| Duplicate | Ignored via dual-layer idempotency (app check + DB unique constraint) |
| Expired | VA closed with no payment — terminal state, no further action |
| Refunded | Excess or full refund issued — order closed |

### Rounding-Safe Split Calculation

Split math guarantees `sum(allocations) === amountKobo` always. Integer division remainder is assigned to the highest-percentage party — no kobo is ever lost to floating-point rounding:

```typescript
// Every split is computed as Math.floor(amount * percentage / 100)
// The remainder goes to the largest-percentage party
// Result: allocations always sum exactly to the input amount
// Tested: 101 kobo split 85/10/5 → seller gets 86, not 85
```

### Flexible Settlement

- **With splits** — configure any split at order creation (seller/platform/rider/etc.)
- **Without splits** — set one settlement account on your merchant profile; full amount auto-transfers on payment
- **No settlement account** — funds stay in sub-account until configured

### Bank Code Validator

625 Nigerian banks are catalogued inline — no JSON file read at runtime. Every split recipient's `bankCode` is validated before order creation. The admin panel exposes a live lookup tool against Nomba's API to verify any `bankCode + accountNumber` combination resolves before it's ever used in a real transfer.

### Hardened Webhook Engine

- **HMAC-SHA256 signature verification** — Nomba's specific field-order scheme verified before touching the DB
- **Raw body preserved** — webhook route uses `express.raw()` before global JSON parser, signature computed on exact bytes
- **Dual-layer idempotency** — application pre-check + `UNIQUE` constraint on `webhook_events.requestId` catches race conditions
- **Persist-before-process** — raw event stored before business logic, enabling replay on failure
- **Always returns 200** — prevents Nomba retry storms; failures are logged and flagged, not retried

### Three-Tier Rate Limiting

| Tier | Limit | Window | Key | Protects |
|------|-------|--------|-----|----------|
| Auth | 10 req | 15 min | IP | Credential stuffing |
| API | 100 req | 1 min | API key | Per-merchant fairness |
| Global | 200 req | 1 min | IP | Catch-all backstop |

Redis-backed in production (shared across instances). In-memory fallback in development.

### Outbound Merchant Webhooks

After each classification, NairaRails POSTs a signed `payment.classified` event to the merchant's registered webhook URL (HMAC-SHA256), enabling real-time programmatic integration. The webhook secret is generated at signup and rotatable via the Settings page.

### AI Support Chat (Gemini 2.5 Flash)

Floating support assistant on the dashboard. Powered by a **7-tool function-calling loop** that queries the merchant's live data directly from the database — no HTTP round-trips:

| Tool | What it fetches |
|------|----------------|
| `get_dashboard_overview` | Collection rate, order counts by status, financial summary |
| `list_orders` | Orders filtered by status, searchable by ref or customer name |
| `get_order_detail` | Full reconciliation detail, splits, and ledger entries for one order |
| `get_exceptions` | All open underpayments, overpayments, and unmatched payments |
| `generate_collection_report` | Daily trend, top payers, success rate breakdown for 7d/30d/all |
| `get_recent_transactions` | Latest ledger entries — payments, payouts, refunds |
| `get_merchant_info` | Account settings, settlement account, API key status |

Auto-escalates sensitive topics (missing money, fraud, legal) to **human support tickets**. The full conversation is stored on escalation so the ops team has context before replying. Merchants can view their own ticket queue at any time.

### Nightly Reconciliation Backstop

`node-cron` at 02:00 WAT pulls yesterday's successful transactions from Nomba's `/transactions` API, diffs against local `ledger_entries` by `transactionId`, and surfaces:
- **Orphans** — on Nomba's side but missing locally (likely dropped webhook)
- **Amount drift** — Nomba's amount differs from local ledger

Never auto-heals — surfaces for ops review. The same function is callable on-demand from the admin panel with a custom date range.

### Merchant Auth & API Keys

- Email/password via Supabase Auth with email verification required before key issuance
- `nrk_live_*` prefixed keys stored as **SHA-256 hashes** — plaintext shown once at issuance
- Keys support optional expiry dates set at issuance or rotation
- Keys can be rotated (old key immediately invalidated), revoked, or re-issued
- Suspended accounts blocked at middleware before route logic

---

## Nomba Integration Depth

NairaRails uses **7 distinct Nomba API endpoints** across both v1 and v2:

| Endpoint | Version | Purpose |
|----------|---------|---------|
| `POST /auth/token/issue` | v1 | OAuth token (cached, 55-min refresh before 60-min expiry) |
| `POST /accounts/virtual/{subAccountId}` | v1 | VA creation via sub-account (required for webhook delivery) |
| `DELETE /accounts/virtual/{identifier}` | v1 | VA expiry |
| `GET /transfers/banks` | v1 | Bank codes discovery |
| `POST /transfers/bank/lookup` | **v2** | Account verification before every transfer |
| `POST /transfers/bank` | **v2** | Settlement and split payouts (kobo→naira conversion) |
| `GET /transactions/accounts/{subAccountId}` | v1 | Nightly reconciliation diff |

**Key architectural decisions:**

1. **Sub-account route for VA creation** — webhooks only fire for VAs on this route. Hard guard throws if `NOMBA_SUB_ACCOUNT_ID` is unset.
2. **`aliasAccountReference` for order lookup** — maps inbound webhook to order without secondary DB query.
3. **Always lookup before transfer** — `lookupBankAccount()` is mandatory before `transferToBank()`. Sending to a wrong NUBAN is irreversible.
4. **Amount boundary: kobo internally, naira for Transfers v2** — conversion happens once at the `transferToBank` boundary.
5. **`payment_success` + `vact_transfer` type** — correctly identifies VA funding events (not the non-existent `virtual_account.funded`).
6. **VA expiry synced to Nomba** — when an order expires or is admin-reset, `DELETE /accounts/virtual` is called best-effort so the NUBAN stops accepting payments.

---

## Security

- **HMAC-SHA256** on both inbound (Nomba) and outbound (merchant) webhooks
- **API keys stored as SHA-256 hashes** — DB compromise doesn't leak keys
- **Timing-safe signature comparison** via `crypto.timingSafeEqual`
- **Helmet** security headers (X-Frame-Options, X-Content-Type-Options, etc.)
- **Rate limiting** with Redis-backed shared state across instances
- **Fail-closed patterns** — missing secrets → reject, never skip verification
- **Merchant scoping** — all queries filtered by authenticated merchant, no cross-tenant access
- **Append-only ledger** — `LedgerEntry` table is never updated or deleted
- **Sender identity stored** — refunds always go back to the account that actually paid, not an arbitrary bank detail

---

## Customer-Level Reporting

The merchant dashboard provides:

- **6 KPI stat cards** — total expected, total received (with collection rate %), open exceptions, paid/pending/underpayment counts
- **Revenue chart** — daily area chart with gradient fill (7d/30d range)
- **Orders by status** — stacked bar chart (Paid/Pending/Underpayment/Overpayment)
- **Collection rate bar** — color-coded: green (≥90%), amber (50-89%), red (<50%)
- **Exception queue** — tabbed (Overpayment/Underpayment/Unmatched) with count badges, contextual guidance, and one-click refund actions with confirmation modals
- **Per-order reconciliation drawer** — full audit trail (ledger entries, splits, webhook events)
- **Auto-refresh** — dashboard every 15s, exceptions every 15s
- **AI-generated reports** on demand via support chat — collection rate, daily trend, top payers

---

## Dashboard UX Details

A few frontend details worth noting that are not visible from the API:

- **Dark / Light / System theme** — three-way toggle (Light / System / Dark) available throughout the dashboard, persisted across sessions. The sidebar variant uses an animated sliding pill with no flicker on load.
- **Paginated order list** — `GET /api/v1/orders` supports `?page=&page_size=&status=` with cursor-style navigation. The dashboard orders table renders this with client-side filter chips.
- **Outbound webhook timeout** — merchant webhook delivery enforces a hard 5-second `AbortSignal` timeout; a slow endpoint never blocks the inbound Nomba response path.
- **Interactive payment flow diagram** — the landing page includes a `PaymentFlowDiagram` component that walks through the order → NUBAN → payment → split lifecycle visually alongside the API code sample.
- **Copy-button on every code block** — the embedded docs portal and all inline code snippets on the landing page include a one-click copy button with a 2-second "Copied" confirmation.

---

## Internal Ops Admin Panel

A full internal panel (`/admin`) gated by `x-admin-secret` header. Eight sections:

| Section | What it does |
|---------|-------------|
| **Overview** | System-wide stats: total orders, merchants, exceptions, revenue |
| **Merchants** | Full merchant list with order counts, key status, email verified flag |
| **Orders** | Cross-merchant order list with filters (status, merchant, date range, pagination) |
| **Reconcile** | On-demand diff of Nomba transactions vs local ledger for any date range |
| **Tools** | Bank lookup, per-order reset (wipes bad classification, expires VA on Nomba), force-pay (manually triggers splits when webhook was dropped) |
| **Webhooks** | Raw webhook event log — full payload inspection for debugging |
| **Health** | System health: env var check, DB connectivity and latency, process metrics, uptime |
| **Support** | View and resolve escalated merchant support tickets |
| **Danger** | Suspend/reactivate merchants, revoke keys, hard-delete merchants, nuke sandbox data |

Admin actions include:
- **Suspend / reactivate** merchants — suspended accounts get 403 at middleware
- **Force-verify email** — for sandbox testing without email flow
- **Revoke API keys** remotely for any merchant
- **Force-pay an order** — mark paid and execute splits when a webhook was dropped
- **Reset an order** — wipe bad classification state and remove webhook idempotency lock so the event can be replayed
- **Bulk expire pending** — mark all (or targeted) pending orders as expired and close their VAs on Nomba

---

## Developer Documentation

NairaRails ships a **7-page developer docs portal** embedded in the dashboard (`/docs`), rendered from Markdown with syntax-highlighted code blocks and a copy button on every snippet:

| Doc | Covers |
|-----|--------|
| Quickstart | From zero to first payment in 5 minutes |
| Authentication | API key lifecycle, JWT session, email verification |
| Orders | Creating orders, VA details, pagination, order statuses |
| Webhooks | Inbound event structure, signature verification, idempotency |
| Exceptions | Underpayment/overpayment flows, refund actions |
| Amounts | Kobo convention, conversion rules, split rounding |
| Errors | Every error code with cause and resolution |

---

## Unit Tests (27 tests, 3 suites)

All tests live in `packages/webhook-core` — the pure logic layer with zero I/O. Suites:

```
reconciler.test.ts      — 13 tests: classify, shortfallKobo, excessKobo boundary cases
splitCalculator.test.ts —  7 tests: rounding remainder, odd amounts, single-party 100%, metadata
verifySignature.test.ts —  7 tests: valid sig, tampered fields, wrong secret, empty inputs
```

Every edge case that matters for financial correctness is covered: 1-kobo shortfall, 1-kobo excess, minimum meaningful amount, rounding remainder assignment, timing-safe rejection.

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)

### Install & Run

```bash
git clone https://github.com/obimz/nairarails.git
cd nairarails
pnpm install

cp .env.example .env
# Fill in all values (see .env.example for documentation)

pnpm build          # Build shared packages (required first time)
pnpm dev            # Start API (port 3000) + Web (port 5173)
```

### Database

```bash
pnpm --filter @nairarails/api db:push       # Apply schema to Supabase (dev)
pnpm --filter @nairarails/api db:migrate    # Apply migrations (prod)
```

### Seed Demo Data

```bash
npx tsx --env-file=.env apps/api/src/scripts/seed.ts
```

### Tests

```bash
pnpm test                                        # All packages
pnpm --filter @nairarails/webhook-core test      # Pure logic only
```

### Receive Webhooks Locally

```bash
ngrok http 3000
# Register: https://<id>.ngrok-free.app/api/v1/webhooks/nomba
```

---

## Deployment

| Component | Platform | Config |
|-----------|----------|--------|
| API | Railway | `railway.toml` — auto-deploys from `main`, health check at `/health` |
| Frontend | Vercel | Root directory `apps/web`, framework auto-detected as Vite |
| Database | Supabase | PostgreSQL with session pooler (port 5432) |
| Rate Limiting | Redis (Upstash) | `REDIS_URL` env var activates production store |

CI/CD runs on every push to `main`: type-check → test → build → deploy.

---

## Judging Criteria Alignment

| Criterion | Implementation |
|-----------|---------------|
| **Reconciliation logic quality** | Pure-function classifier in `webhook-core`, 27 unit tests across 3 suites, dual-layer idempotency, append-only ledger, nightly reconciliation backstop, on-demand admin diff |
| **Underpayment handling** | Funds held, splits blocked, shortfall calculated, customer pays balance to same NUBAN, splits unblock on full receipt |
| **Overpayment handling** | Splits execute on expected amount only, excess quarantined separately, one-click refund to original sender's account |
| **Customer-level reporting** | 6 KPIs, 2 time-series charts, collection rate bar, tabbed exception queue, per-order audit trail, 15s auto-refresh, AI-generated collection reports |
| **Nomba Integration Depth** | 7 endpoints across v1/v2, sub-account VA creation, aliasAccountReference lookup, lookup-before-transfer, nightly transaction diff, VA expiry sync |
| **Security & Reliability** | HMAC both directions, SHA-256 key storage, 3-tier rate limiting, timing-safe comparison, fail-closed patterns, sender identity capture for accurate refunds |
| **Developer Experience** | 7-page embedded docs portal, AI support chat with live data tools, clear error codes, kobo convention enforced throughout |
| **Operational Completeness** | Full admin panel, merchant suspend/reactivate, force-pay for dropped webhooks, order reset for bad classifications, system health monitor, escalated support tickets |

---

*Built for the **Nomba × DevCareer Hackathon 2026** — Virtual Accounts as Infrastructure.*
