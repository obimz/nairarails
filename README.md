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

## Architecture

```
nairarails/                        pnpm + Turborepo monorepo
├── apps/
│   ├── api/                       Express + TypeScript backend (port 3000)
│   │   ├── src/routes/            orders, webhooks, exceptions, dashboard, auth, admin, support
│   │   ├── src/middleware/        apiKeyAuth, jwtAuth, rateLimiter, errorHandler
│   │   ├── src/integrations/     nombaClient.ts — all outbound Nomba calls
│   │   ├── src/lib/              reconciliationCron, notifyMerchant, logger
│   │   └── prisma/              schema.prisma
│   └── web/                       React + Vite dashboard (port 5173)
│       └── src/
│           ├── pages/            Overview, Orders, Exceptions, Settings, Admin
│           ├── components/       SupportChat, charts, StatusBadge, ThemeToggle
│           └── lib/              apiFetch, money formatters, supabase client
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
| 3D Landing | Three.js + React Three Fiber + GSAP |
| Payments | Nomba Virtual Account API + Transfers v2 + Webhooks |
| AI Support | Gemini 2.5 Flash (tool-calling) |
| Rate Limiting | express-rate-limit + Redis |
| Testing | Vitest |
| CI/CD | GitHub Actions → Railway (API) + Vercel (Frontend) |

---

## Core Features

### Per-Order Virtual Accounts

Every order gets a unique Nomba NUBAN created via Nomba's **sub-account route** — the only route that triggers webhook delivery. When payment arrives, the system already knows which order it belongs to. There is no matching step.

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

### Rounding-Safe Split Calculation

Split math guarantees `sum(allocations) === amountKobo` always. Integer division remainder is assigned to the highest-percentage party — no kobo is ever lost to floating-point rounding:

```typescript
// Every split is computed as Math.floor(amount * percentage / 100)
// The remainder goes to the largest-percentage party
// Result: allocations always sum exactly to the input amount
```

### Flexible Settlement

- **With splits** — configure any split at order creation (seller/platform/rider/etc.)
- **Without splits** — set one settlement account, full amount auto-transfers on payment
- **No settlement account** — funds stay in sub-account until configured

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

After each classification, NairaRails POSTs a signed `payment.classified` event to the merchant's registered webhook URL (HMAC-SHA256), enabling real-time programmatic integration.

### AI Support Chat (Gemini 2.5 Flash)

Floating support assistant on the dashboard. Answers questions about orders, splits, and reconciliation using tool-calling against the merchant's live data. Auto-escalates sensitive topics (missing money, fraud, legal) to human support tickets.

### Nightly Reconciliation Backstop

`node-cron` at 02:00 WAT pulls yesterday's successful transactions from Nomba's `/transactions` API, diffs against local `ledger_entries` by `transactionId`, and surfaces:
- **Orphans** — on Nomba's side but missing locally (likely dropped webhook)
- **Amount drift** — Nomba's amount differs from local ledger

Never auto-heals — surfaces for ops review. Same function callable on-demand from the admin panel.

### Merchant Auth & API Keys

- Email/password via Supabase Auth with email verification required
- `nrk_live_*` prefixed keys stored as **SHA-256 hashes** — plaintext shown once at issuance
- Keys can be rotated, revoked, and given expiry dates
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
| **Reconciliation logic quality** | Pure-function classifier in `webhook-core`, 27 unit tests, dual-layer idempotency, append-only ledger, nightly reconciliation backstop |
| **Underpayment handling** | Funds held, splits blocked, shortfall calculated, one-click refund to sender |
| **Overpayment handling** | Splits execute on expected amount only, excess quarantined separately, one-click refund of excess |
| **Customer-level reporting** | 6 KPIs, 2 time-series charts, collection rate bar, tabbed exception queue, per-order audit trail, 15s auto-refresh |
| **Nomba Integration Depth** | 7 endpoints across v1/v2, sub-account VA creation, aliasAccountReference lookup, lookup-before-transfer, nightly transaction diff |
| **Security & Reliability** | HMAC both directions, SHA-256 key storage, 3-tier rate limiting, timing-safe comparison, fail-closed patterns |

---

*Built for the **Nomba × DevCareer Hackathon 2026** — Virtual Accounts as Infrastructure.*
