# NairaRails 🛤️

> **Every naira has an address. Every settlement has a rule. Every exception is caught before it becomes a crisis.**

**NairaRails** is programmable payment infrastructure for Nigerian marketplace commerce — built on Nomba's Virtual Account API for the **Nomba × DevCareer Hackathon 2026, Build Track: Virtual Accounts as Infrastructure.**

---

## The Problem

Nigeria processed **₦1.07 quadrillion** in digital transactions in 2024.

Marketplace payments still reconcile in spreadsheets.

A marketplace operator collects into one shared bank account. Every transfer arrives as a sender name and an amount — nothing else. A finance officer spends hours matching "Chidi Obi — ₦45,000" against 200 open orders. Splits happen the next morning in Excel. When a buyer pays ₦48,000 instead of ₦50,000, the shortfall quietly disappears. When NIBSS hiccupped in September 2024, ₦13.66 billion was posted without a corresponding debit — nobody caught it until Monday.

**₦35.56 billion** was lost to publicly documented reconciliation failures in Nigeria between 2023 and 2024.

Every marketplace either builds this reconciliation layer themselves — badly — or doesn't build it at all.

---

## What NairaRails Solves

NairaRails gives every order its own **unique virtual account number (NUBAN)** via Nomba. The moment a buyer pays, a webhook fires and NairaRails takes over:

1. **Matches** the payment to the exact order — zero manual lookup
2. **Classifies** it: exact, underpayment, or overpayment
3. **Routes** it: splits execute in the same webhook cycle, on-chain with every kobo accounted for
4. **Reports** it: a live dashboard shows every order, every exception, every naira's location in real time

No spreadsheets. No batch jobs. No Monday morning surprises.

---

## Who It's For

NairaRails works for any business that collects payments and needs them matched to something:

| Use case | How NairaRails helps |
|---|---|
| **Marketplace** (food, e-commerce, logistics) | Per-order virtual accounts + automatic percentage splits to seller, platform, rider |
| **School fees** | Per-student accounts — every payment matched to the right student, automatically |
| **Landlord rent collection** | Per-tenant accounts — arrears tracked, shortfalls flagged |
| **Freelancer invoicing** | Per-invoice accounts — client pays the right NUBAN, you're notified immediately |
| **Ajo / Esusu contributions** | Per-member, per-cycle accounts — contributions tracked without a human counter |
| **Any merchant without splits** | Set a settlement account — full amount transfers on payment, no configuration per order |

**Splits are optional.** Merchants who only need reconciliation get that. Merchants who configure splits choose their own model. NairaRails executes policy — it doesn't impose one.

---

## Live Demo

| Surface | URL |
|---|---|
| Frontend (Vercel) | https://nairarails.vercel.app |
| API (Railway) | https://nairarails-api.up.railway.app |
| API Health | https://nairarails-api.up.railway.app/health |
| Demo API key | `nrk_live_demo_seed_key` (pre-seeded, use in `x-api-key` header) |

**Quick demo flow:**
1. Sign up at `/signup` → verify email → API key issued once (copy it)
2. `POST /api/v1/orders` with your key → receive a real Nomba NUBAN back
3. Send a payment to that NUBAN in the Nomba sandbox
4. Webhook fires → dashboard updates live → splits execute or full settlement transfers
5. Try an underpayment → shortfall flagged, splits blocked
6. Try an overpayment → excess quarantined, one-click refund in Exceptions tab

---

## Core Features

### 🏦 Per-Order Virtual Accounts
Every order gets a unique Nomba NUBAN created via Nomba's sub-account route — the only route that triggers webhook delivery. When payment arrives, the system already knows which order it belongs to. There is no matching step.

### ⚡ Real-Time Webhook Reconciliation
Every inbound payment is classified the moment it arrives:

| State | What happens |
|---|---|
| **Exact match** | Mark paid → execute splits or settlement → notify merchant |
| **Underpayment** | Hold funds → calculate shortfall → block splits until topped up |
| **Overpayment** | Run splits on expected amount only → quarantine excess → one-click refund |
| **Unmatched** | Quarantine immediately → alert ops team → nothing disappears silently |
| **Duplicate** | Ignored via idempotency key on Nomba's `requestId` — processed exactly once |

The reconciler is a pure function with zero side effects, tested in isolation:

```typescript
// packages/webhook-core/src/reconciler.ts
export function classify(
  expectedKobo: number,
  receivedKobo: number
): "paid" | "underpayment" | "overpayment" | "unmatched" {
  if (receivedKobo === 0 && expectedKobo > 0) return "unmatched";
  if (receivedKobo === expectedKobo) return "paid";
  if (receivedKobo < expectedKobo) return "underpayment";
  return "overpayment";
}
```

### 💸 Flexible Settlement

**With splits** — configure any split at order creation. Every recipient is verified via Nomba's account-lookup before any transfer executes (sending to a wrong NUBAN is irreversible):

```json
{
  "splits": [
    { "party": "seller",   "account_number": "0123456789", "bank_code": "058", "percentage": 85 },
    { "party": "platform", "account_number": "9876543210", "bank_code": "058", "percentage": 10 },
    { "party": "rider",    "account_number": "1122334455", "bank_code": "044", "percentage": 5  }
  ]
}
```

Split math is rounding-safe — any kobo remainder is assigned to the largest-percentage party so allocations always sum exactly back to the expected amount.

**Without splits** — merchants set one settlement account in Settings. On payment, the full expected amount transfers automatically.

**No settlement account** — funds stay in the Nomba sub-account. Merchant is notified on the dashboard and can configure settlement at any time.

### 📊 Live Merchant Dashboard
- **Overview** — total expected vs received, live collection rate, order status charts (7d / 30d / all time)
- **Orders** — full table with status filters, date filters, per-order reconciliation drawer with complete audit trail
- **Exceptions** — tabbed queue (overpayment / underpayment / unmatched) with one-click refund actions
- **Settings** — settlement account, webhook URL, webhook secret rotation, API key management

### 🛡️ Hardened Webhook Engine

Webhooks are money. A missed event = an unmatched payment. A duplicate = a double split. Every line in the webhook handler exists to prevent one of those outcomes.

- **HMAC-SHA256 signature verification** — Nomba signs every event using a specific field order (`event_type:requestId:userId:walletId:transactionId:type:time:responseCode:timestamp`). NairaRails verifies this on every inbound call, before touching the database. Requests with a bad or missing signature are rejected with `401`.
- **Raw body preserved for HMAC** — The webhook route is mounted with `express.raw()` before the global `express.json()` parser. Nomba's signed bytes are never mutated by JSON parse/stringify — the signature check runs on the exact bytes Nomba sent.
- **Dual-layer idempotency** — A pre-check query catches known `requestId`s before any writes. A DB-level `UNIQUE` constraint on `webhook_events.requestId` catches the race condition where two concurrent requests both pass the pre-check. The second `INSERT` fails with `P2002` and returns `200` — no duplicate processing, no error.
- **Persist before processing** — The raw event is written to `webhook_events` before any business logic runs. If anything downstream throws, the event is still on record and can be replayed.
- **Immediate `200` response** — Once the event is safely persisted, NairaRails returns `200` before executing splits. Nomba never retries a handled event. Split failures are logged and flagged, but never cause a retry storm.
- **Full raw event log** — Every inbound Nomba payload is stored verbatim in `webhook_events` — an immutable audit trail for dispute resolution.

### 🔒 Rate Limiting

Three-tier rate limiting using `express-rate-limit` with Redis in production and an in-memory fallback in development. Applied before any route handler runs.

| Tier | Limit | Window | Keyed by | Protects |
|---|---|---|---|---|
| **Auth** | 10 req | 15 min | IP | `/auth/register`, `/auth/login` — blocks credential stuffing |
| **API** | 100 req | 1 min | `x-api-key` (first 20 chars) | Orders, exceptions, dashboard, key management |
| **Global** | 200 req | 1 min | IP | All other routes — catch-all backstop |

```
# 429 response shape — consistent across all tiers
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded for this API key. Maximum 100 requests per minute."
  }
}
```

- **Redis-backed in production** — limits are shared across all API instances. `REDIS_URL` env var activates it automatically.
- **Per-key limiting on API tier** — each merchant's API key has its own 100 req/min budget. A high-volume merchant can't starve another merchant.
- **In-memory fallback in dev** — if `REDIS_URL` is not set, `express-rate-limit`'s default memory store is used. A warning is logged on startup so it's never silently misconfigured in production.

### 🔔 Outbound Merchant Webhooks
After each classification, NairaRails POSTs a `payment.classified` event to the merchant's registered webhook URL, signed with HMAC-SHA256 so the merchant can verify authenticity:

```json
{
  "event": "payment.classified",
  "order_ref": "ord-001",
  "status": "paid",
  "received_amount_kobo": 500000,
  "expected_amount_kobo": 500000,
  "splits_executed": true,
  "timestamp": "2026-07-07T10:00:00Z"
}
```

### 🤖 AI Support Chat (Gemini 2.5 Flash)
A floating support assistant on the merchant dashboard. It answers questions about orders, splits, API keys, and reconciliation using NairaRails-specific knowledge. When it can't answer — or when a message contains keywords like "missing money", "fraud", or "legal" — it escalates automatically to a human support ticket. Merchants see open tickets in the chat panel and on the Overview dashboard.

### 🌙 Nightly Reconciliation Backstop

A `node-cron` job runs at **02:00 WAT (01:00 UTC)** every night inside the API process. It:

1. Pulls all successful transactions from Nomba's `/transactions` API for the previous calendar day
2. Diffs them against local `ledger_entries` by `transactionId` reference
3. Surfaces two classes of issue:
   - **Orphans** — transactions on Nomba's side with no matching local record (most likely cause: webhook was dropped while the server was restarting)
   - **Amount drift** — transactions where Nomba's recorded amount differs from what the local ledger says
4. Logs a `⚠️ Reconciliation drift detected` warning with full context if any discrepancies are found, or a `✅ Reconciliation clean` confirmation if everything matches

The cron never auto-heals — it surfaces for ops review. Orphaned payments can be replayed via `POST /api/v1/admin/orders/:orderRef/force-pay` in the admin panel. The same `runReconciliation(dateFrom, dateTo)` function is also callable on-demand from the admin Reconcile tab for any arbitrary date range.

### 🔑 Merchant Auth & API Keys

- Email/password registration via Supabase Auth with email verification required before any API access
- `nrk_live_*` prefixed API keys, stored as **SHA-256 hashes** — the plaintext is shown exactly once at issuance and never stored anywhere
- Every marketplace-facing route accepts either `x-api-key` **or** `Authorization: Bearer <jwt>` — pick whichever fits your integration
- Incoming keys are authenticated by hashing the submitted key and comparing against the stored hash — no plaintext comparison ever happens
- Keys can be rotated, revoked, and given a hard expiry date — expired keys return `401` with an actionable error message
- Suspended merchant accounts are blocked at the auth middleware layer with a `403 ACCOUNT_SUSPENDED` before any route logic runs

### 🚦 Central Error Handler

Every thrown error funnels through a single Express error handler that maps to a consistent response shape:

```json
{ "error": { "code": "MACHINE_READABLE_CODE", "message": "Human-readable explanation" } }
```

- `AppError` — structured application errors with HTTP status codes (400, 401, 403, 404, 409, etc.)
- `PrismaClientInitializationError` → `503 SERVICE_UNAVAILABLE` — graceful handling when the DB is cold-starting
- `PrismaClientKnownRequestError` → `500 DATABASE_ERROR` — prevents Prisma internals leaking into API responses
- All other errors → `500 INTERNAL_ERROR` — logged with full stack trace, never surfaced to callers

### 🏛️ Admin Panel (`/admin`)
Internal ops panel gated by `x-admin-secret`:

| Section | What it does |
|---|---|
| **Overview** | System-wide stats across all merchants |
| **Merchants** | Full list with suspend, reactivate, force-verify, revoke key, edit |
| **Orders** | Cross-merchant order table with filters and per-order detail drawer |
| **Reconcile** | On-demand diff of Nomba transactions vs local ledger |
| **Webhooks** | Full inbound webhook event log |
| **Health** | Environment variable checklist, DB connectivity, memory, uptime |
| **Tools** | Bank account lookup, bulk expire, order reset |
| **Support** | All escalated merchant support tickets with conversation history and resolve action |
| **Danger** | Nuclear option — wipes all orders and expires all VAs |

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Marketplace App                    │
│         (order creation → payment request)          │
└──────────────────────┬──────────────────────────────┘
                       │ REST API  (x-api-key or Bearer JWT)
┌──────────────────────▼──────────────────────────────┐
│                NairaRails API (Express)              │
│                                                      │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  VA Engine   │  │  Webhook    │  │ Reconciler │ │
│  │  (Nomba VA   │  │  Handler    │  │ classify + │ │
│  │   sub-acct)  │  │  HMAC +     │  │ split math │ │
│  │              │  │  idempotency│  │            │ │
│  └──────┬───────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                 │               │         │
│  ┌──────▼─────────────────▼───────────────▼──────┐  │
│  │              PostgreSQL (Supabase)             │  │
│  │  orders · splits · ledger_entries ·            │  │
│  │  webhook_events · merchants · support_tickets  │  │
│  └─────────────────────────┬─────────────────────┘  │
│                            │                         │
│  ┌─────────────────────────▼────────────────────┐   │
│  │     Settlement Engine (Nomba Transfers v2)    │   │
│  │  lookup → transfer → ledger entry             │   │
│  │  splits (percentage) or full settlement       │   │
│  └─────────────────────────┬────────────────────┘   │
│                            │                         │
│  ┌─────────────────────────▼────────────────────┐   │
│  │   Dashboard API · Support API · Admin API     │   │
│  │   React dashboard — live, per-order view      │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │  node-cron — nightly reconciliation backstop  │  │
│  │  02:00 WAT · diffs Nomba vs local ledger       │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                          │
        ┌─────────────────▼──────────────────┐
        │           Nomba API                 │
        │  Virtual Accounts · Transfers v2    │
        │  Webhooks · Transactions            │
        └─────────────────────────────────────┘
```

**Data model (key tables):**

| Table | Purpose |
|---|---|
| `orders` | One row per order — NUBAN, status, expected/received kobo, sender details |
| `splits` | One row per split party per order — percentage, kobo amount, transfer ref, status |
| `ledger_entries` | Append-only log of every money movement (payment_received, split_payout, refund_issued) |
| `webhook_events` | Every raw inbound Nomba event — unique on `requestId`, the DB-level idempotency guarantee |
| `merchants` | Merchant profile, hashed API key, settlement account, webhook secret |
| `support_tickets` | AI-escalated support conversations with full message history |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend API | Express (TypeScript) |
| Validation | Zod — schemas shared between frontend and backend via `@nairarails/shared-types` |
| Database | PostgreSQL via Supabase |
| ORM | Prisma |
| Auth | Supabase Auth (email/password + JWT) |
| Frontend | React + Vite, TanStack Query, Tailwind CSS, Recharts |
| 3D Landing | Three.js + GSAP |
| Payment Infrastructure | Nomba Virtual Account API, Transfers v2, Webhooks, Transactions API |
| AI Support | Gemini 2.5 Flash |
| Scheduled Jobs | node-cron (inside API process) |
| Rate Limiting | express-rate-limit + Redis (in-memory fallback in dev) |
| Testing | Vitest |
| CI/CD | GitHub Actions → Railway (API) + Vercel (Frontend) |

---

## Project Structure

```
nairarails/
├── apps/
│   ├── web/                    # React + Vite frontend
│   │   └── src/
│   │       ├── pages/          # Landing, Onboarding, Login, Overview, Orders,
│   │       │                   # Exceptions, Settings, Admin, Docs
│   │       ├── components/     # SupportChat, HeroNetworkScene, ThemeToggle, StatusBadge
│   │       └── lib/            # apiFetch, money formatters, queryClient, supabase
│   └── api/                    # Express backend
│       ├── src/routes/         # orders, webhooks, exceptions, dashboard,
│       │                       # merchants, auth, keys, support, admin
│       ├── src/middleware/     # apiKeyAuth, jwtAuth, authAny, rateLimiter, errorHandler
│       ├── src/lib/            # reconciliationCron, ai-tools, notifyMerchant, logger
│       ├── src/integrations/   # nombaClient.ts — all outbound Nomba calls, token cache
│       ├── src/scripts/        # seed.ts — demo data seeder
│       └── prisma/             # schema.prisma
├── packages/
│   ├── shared-types/           # Zod schemas — single API contract shared by FE + BE
│   └── webhook-core/           # Pure reconciliation + split logic, fully unit-tested
│       └── src/tests/          # reconciler, splitCalculator, verifySignature
├── .env.example                # All required variables documented
├── ROUTES.md                   # Full API contract with Thunder Client examples
├── DEPLOY.md                   # Step-by-step Railway + Vercel deployment guide
└── DEVELOPMENT-HISTORY.md      # Build history across all cycles
```

---

## API Reference

> All amounts are in **kobo** (₦1.00 = 100 kobo), matching Nomba's convention.

### Authentication

Every marketplace-facing route accepts either header:
```
x-api-key: nrk_live_...
Authorization: Bearer <supabase_jwt>
```

### Create an Order
```http
POST /api/v1/orders
x-api-key: nrk_live_...
Content-Type: application/json
```
```json
{
  "order_ref": "ord-001",
  "customer_name": "Chisom Traders",
  "expected_amount_kobo": 5000000,
  "currency": "NGN",
  "splits": [
    { "party": "seller",   "account_number": "0123456789", "bank_code": "058", "percentage": 85 },
    { "party": "platform", "account_number": "9876543210", "bank_code": "058", "percentage": 10 },
    { "party": "rider",    "account_number": "1122334455", "bank_code": "044", "percentage": 5  }
  ]
}
```
`splits` is optional. Omit it entirely for reconciliation-only or full-settlement orders.

**Response (201):**
```json
{
  "order_ref": "ord-001",
  "virtual_account_number": "0123456789",
  "bank_name": "Nomba",
  "status": "pending"
}
```

### Get Order Reconciliation Status
```http
GET /api/v1/orders/{order_ref}/reconciliation
x-api-key: nrk_live_...
```

### Exceptions Queue
```http
GET  /api/v1/exceptions?type=overpayment|underpayment|unmatched
POST /api/v1/exceptions/{order_ref}/refund-excess
POST /api/v1/exceptions/{order_ref}/refund-shortfall
```

### Dashboard
```http
GET /api/v1/dashboard/overview?range=7d|30d|all
GET /api/v1/dashboard/daily-series?range=7d|30d
```

### Support
```http
POST /api/v1/support/chat
GET  /api/v1/support/tickets
```

Full contract with request/response examples lives in `ROUTES.md`.

---

## Reconciliation Logic

The entire payment state machine is in `packages/webhook-core` — pure TypeScript, zero dependencies, fully tested:

```typescript
// packages/webhook-core/src/reconciler.ts
export function classify(expectedKobo: number, receivedKobo: number) {
  if (receivedKobo === 0 && expectedKobo > 0) return "unmatched";
  if (receivedKobo === expectedKobo)           return "paid";
  if (receivedKobo < expectedKobo)             return "underpayment";
  return "overpayment";
}
```

Webhook handler pipeline:
```
receive → verify HMAC → idempotency check (query + DB constraint)
→ persist raw event → classify payment → update order + ledger
→ execute splits or full settlement → notify merchant webhook
→ respond 200
```

Split calculation is rounding-safe — allocations always sum exactly to the expected amount, not to a floor-rounded approximation:

```typescript
// packages/webhook-core/src/splitCalculator.ts
// Any kobo remainder from integer division is assigned to the largest-percentage
// party, so: sum(allocations) === expectedKobo always.
```

Tests (run via `pnpm turbo run test`):

| Test file | What it covers |
|---|---|
| `reconciler.test.ts` | All 7 classification cases including edge boundaries |
| `splitCalculator.test.ts` | Exact sums, rounding remainder assignment, edge amounts |
| `verifySignature.test.ts` | HMAC-SHA256 verification with Nomba's field order |

---

## Setup & Local Development

### Prerequisites

- Node.js 22+
- pnpm 9+

```powershell
# Enable pnpm via corepack (Windows)
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

### Install & Configure

```bash
git clone https://github.com/your-repo/nairarails.git
cd nairarails
pnpm install

cp .env.example .env
# Fill in every value — see Environment Variables section below
```

### Build Shared Packages

The API and web apps import from the monorepo packages. Build them once before running apps:

```bash
pnpm --filter @nairarails/shared-types build
pnpm --filter @nairarails/webhook-core build
```

Re-run this only if you modify files inside `packages/`.

### Run

```bash
# Start everything (Turborepo parallel)
pnpm turbo run dev

# Or individually:
pnpm --filter @nairarails/api dev       # API at http://localhost:3000
pnpm --filter @nairarails/web dev       # Frontend at http://localhost:5173
```

### Seed Demo Data

```bash
pnpm --filter @nairarails/api db:push          # apply schema to Supabase
npx tsx --env-file=.env apps/api/src/scripts/seed.ts
```

Use `nrk_live_demo_seed_key` as the `x-api-key` to authenticate as the demo merchant.

### Receive Webhooks Locally

Nomba can't reach localhost. Use a tunnel:

```bash
# Option A
ngrok http 3000
# Option B
cloudflared tunnel --url http://localhost:3000
```

Register the tunnel URL with Nomba:
```
https://<your-tunnel-id>.ngrok-free.app/api/v1/webhooks/nomba
```

### Run Tests

```bash
pnpm turbo run test                         # all packages
pnpm --filter @nairarails/webhook-core test  # pure logic only
```

---

## Environment Variables

```env
# ── Database (Supabase) ───────────────────────────────────────────────────────
DATABASE_URL=          # Session pooler — port 5432 (Express, long-lived connections)
DIRECT_URL=            # Session pooler — port 5432 (Prisma migrations)
# Note: use port 5432, NOT 6543 (transaction pooler). The transaction pooler
# drops connections unpredictably under long-lived Express processes.

# ── Nomba ─────────────────────────────────────────────────────────────────────
NOMBA_BASE_URL=https://sandbox.api.nomba.com/v1
NOMBA_CLIENT_ID=
NOMBA_CLIENT_SECRET=
NOMBA_ACCOUNT_ID=
NOMBA_SUB_ACCOUNT_ID=  # ⚠️  Critical: webhooks ONLY fire for VAs created via the sub-account route
NOMBA_WEBHOOK_SECRET=

# ── Supabase (server-side only) ───────────────────────────────────────────────
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# ── Auth ──────────────────────────────────────────────────────────────────────
ADMIN_SECRET=          # x-admin-secret header for /api/v1/admin/* routes
JWT_SECRET=

# ── AI Support ────────────────────────────────────────────────────────────────
GEMINI_API_KEY=        # https://aistudio.google.com/app/apikey — free tier works

# ── Frontend (VITE_* are browser-safe, inlined at build time) ─────────────────
VITE_API_BASE=http://localhost:3000
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# ── Server ────────────────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:5173   # CORS allowlist — must match Vercel URL in prod

# ── Optional ──────────────────────────────────────────────────────────────────
REDIS_URL=             # Rate limiter — in-memory fallback if not set
```

---

## Deployment

### Deploy API → Railway

1. Push repo to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. `railway.toml` at repo root configures build/start automatically
4. Add environment variables in the Variables tab (all vars from `.env.example`)
5. Copy your Railway public URL → register it with Nomba:
   ```
   https://your-api.up.railway.app/api/v1/webhooks/nomba
   ```

**Key Railway gotchas:**
- Use Supabase's **session pooler** (port 5432). The transaction pooler (6543) drops connections under Express.
- Railway's free tier sleeps inactive services — upgrade to a paid plan if running a live demo to ensure webhook delivery.
- Health check is at `GET /health` — Railway probes this after every deploy.

### Deploy Frontend → Vercel

1. [vercel.com](https://vercel.com) → Add New Project → import repo
2. Set **Root Directory** to `apps/web`
3. Framework auto-detected as Vite
4. Add environment variable: `VITE_API_BASE=https://your-api.up.railway.app`
5. Set `FRONTEND_URL` on Railway to your Vercel URL (CORS)

**Monorepo build scope** — skip irrelevant rebuilds by adding an Ignored Build Step in Vercel → Settings → Git:
```bash
git diff HEAD^ HEAD --quiet -- apps/web packages/shared-types
```

### CI/CD

GitHub Actions runs on every push to `main`:
1. Type-check (`pnpm turbo run type-check`)
2. Test (`pnpm turbo run test`)
3. Build all packages (`pnpm turbo run build`)
4. Deploy API to Railway (on success)
5. Deploy Frontend to Vercel (on success)

### Quick Reference

```bash
# Local dev
pnpm install
pnpm turbo run dev

# Build
pnpm turbo run build

# Test
pnpm turbo run test

# Database
pnpm --filter @nairarails/api db:push      # sync schema to Supabase (dev)
pnpm --filter @nairarails/api db:migrate   # apply versioned migrations (prod)
pnpm --filter @nairarails/api db:studio    # Prisma Studio GUI at localhost:5555

# Seed demo data
npx tsx --env-file=.env apps/api/src/scripts/seed.ts
```

---

## Judging Criteria

| Criterion | NairaRails |
|---|---|
| **Reconciliation logic quality** | Per-VA matching, all 5 payment states handled explicitly, backed by isolated unit tests in `packages/webhook-core` — pure functions, zero side effects |
| **Underpayment handling** | Funds held in Nomba sub-account, shortfall calculated and surfaced in Exceptions tab, splits blocked until fully paid, one-click buyer refund |
| **Overpayment handling** | Splits execute on the expected amount only (not the received amount), excess quarantined separately, one-click refund to sender from the Exceptions tab |
| **Customer-level reporting** | Live per-order status with full audit trail, collection rate charts (7d/30d/all), exception queue with one-click actions, cross-merchant admin view |
| **Infrastructure depth** | Nightly reconciliation backstop (node-cron 02:00 WAT), outbound webhook signing (HMAC-SHA256), rate limiting (Redis + in-memory fallback), dual-layer idempotency (query + DB constraint), AI support escalation, CI/CD pipeline, Prisma append-only ledger |
| **Nomba API usage** | Virtual Accounts (sub-account route for webhook delivery), Transfers v2 (per-split and settlement payouts), account lookup (recipient verification before transfer), Transactions API (nightly reconciliation diff) |

---

## What's Out of Scope (Stated, Not Hidden)

- BVN/KYC verification
- Retry queue for failed outbound merchant webhooks — delivery is best-effort, failures are logged
- Sub-accounts / persistent per-seller balances — settlement is per-order by design
- Background job queue for webhook processing — synchronous in the same request cycle, correct at hackathon volume

---

## The Insight

Nigeria processes a quadrillion naira digitally every year through infrastructure that still reconciles in spreadsheets.

NairaRails doesn't fix the apps. It fixes the plumbing they run on.

---

*Built for the **Nomba × DevCareer Hackathon 2026** — Virtual Accounts as Infrastructure.*
