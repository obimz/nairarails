# NairaRails 🛤️

> **Every naira has an address. Every settlement has a rule. Every exception is caught before it becomes a crisis.**

NairaRails is programmable payment infrastructure for Nigerian marketplace commerce. Every order gets its own unique bank account number. The moment a buyer pays, the payment is automatically matched, classified, and routed — no spreadsheets, no batch jobs, no manual reconciliation.

Built on Nomba's Virtual Account API for the **Nomba × DevCareer Hackathon 2026 — Build Track, Virtual Accounts as Infrastructure.**

---

## The Problem

Nigeria processed **₦1.07 quadrillion** in digital transactions in 2024 — but marketplace payments still reconcile manually.

A marketplace operator receives payments into one shared bank account. Every transfer shows a sender name and an amount — nothing else. A finance officer spends hours matching "Chidi Obi — ₦45,000" against 200 open orders. Splits happen in a spreadsheet the next morning. When someone pays ₦48,000 instead of ₦50,000, the shortfall quietly disappears. When NIBSS hiccupped in September 2024, ₦13.66 billion was posted without a corresponding debit — nobody caught it until Monday morning.

**₦35.56 billion** was lost to publicly documented reconciliation failures in Nigeria between 2023 and 2024.

Every marketplace either builds this reconciliation layer themselves, badly, or doesn't build it at all.

---

## What NairaRails Does

NairaRails assigns every order its own **unique virtual account number** (NUBAN) via Nomba. The moment a buyer pays, a webhook fires and NairaRails takes over:

1. **Matches** the payment to the exact order — zero manual lookup
2. **Classifies** it: exact match, underpayment, or overpayment
3. **Routes** it instantly: splits execute in the same webhook cycle
4. **Reports** it: live dashboard with every order's status, every exception, every naira's location

No spreadsheets. No batch jobs. No Monday morning surprises.

---

## Who It's For

NairaRails works for any business that collects payments and needs them matched to something:

| Use case | How NairaRails helps |
|---|---|
| **Marketplace** (food, e-commerce, logistics) | Per-order virtual accounts + percentage splits to seller, platform, rider |
| **School fees** | Per-student virtual accounts — every payment matched to the right student automatically |
| **Landlord rent collection** | Per-tenant virtual accounts — arrears tracked, shortfalls flagged |
| **Freelancer invoicing** | Per-invoice accounts — client pays the right NUBAN, you get notified |
| **Ajo / Esusu contributions** | Per-member, per-cycle accounts — contributions tracked without a human counter |
| **Any merchant without splits** | Set a settlement account — full amount transferred there automatically on payment |

**Splits are optional.** Merchants who don't need fund distribution use NairaRails purely for reconciliation. Merchants who do configure splits choose their own model — percentage-based or single recipient. NairaRails executes the policy; it doesn't impose one.

---

## Core Features

### 🏦 Per-Order Virtual Accounts
Every order gets a unique Nomba NUBAN. When payment arrives, the system already knows which order it belongs to — no matching required. Virtual accounts are created via Nomba's sub-account route, which is the only path that triggers webhook delivery.

### ⚡ Real-Time Webhook Reconciliation
Every inbound payment triggers immediate classification:

| State | What happens |
|---|---|
| **Exact match** | Mark paid → execute splits or settlement transfer → notify merchant |
| **Underpayment** | Hold funds → flag shortfall → splits blocked until topped up |
| **Overpayment** | Mark paid → execute splits on expected amount → quarantine excess → one-click refund available |
| **Unmatched** | Quarantine immediately → alert ops team → nothing disappears silently |
| **Duplicate** | Ignored via idempotency key on Nomba's `requestId` — processed exactly once |

### 💸 Flexible Settlement

**With splits** — configure any split at order creation. Each party is verified via Nomba's account-lookup before any transfer moves, sending to a wrong NUBAN is irreversible:

```json
{
  "splits": [
    { "party": "seller",   "account_number": "0123456789", "bank_code": "058", "percentage": 85 },
    { "party": "platform", "account_number": "9876543210", "bank_code": "058", "percentage": 10 },
    { "party": "rider",    "account_number": "1122334455", "bank_code": "044", "percentage": 5  }
  ]
}
```

**Without splits** — merchants set a settlement account in Settings. On payment, the full amount transfers there automatically. No splits, no configuration on each order.

**No settlement account** — funds stay in the Nomba sub-account. Merchants are notified in the dashboard and can configure a settlement account at any time.

### 📊 Live Merchant Dashboard
- Overview: total expected vs received, collection rate, order status charts (7d / 30d)
- Orders: full table with status filters, date filters, per-order reconciliation drawer with audit trail
- Exceptions: tabbed queue (overpayment / underpayment / unmatched) with one-click refund actions

### 🛡️ Hardened Webhook Engine
- HMAC-SHA256 signature verification on every inbound event
- Idempotency enforced at DB level — unique constraint on `requestId`
- Immediate `200` once the event is safely recorded — Nomba never retries a handled event
- Full raw event log retained — evidence in any dispute

### 🔔 Outbound Merchant Webhooks
After each classification, NairaRails POSTs a `payment.classified` event to the merchant's registered webhook URL. Signed with HMAC-SHA256 so the merchant can verify authenticity. Fire-and-forget — a failed delivery never blocks the inbound handler.

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

### 🤖 AI Support Chat
Merchants get a floating support assistant on the dashboard, powered by Gemini 2.5 Flash. It answers questions about orders, splits, API keys, and reconciliation using NairaRails-specific knowledge. When it can't answer — or when a message contains keywords like "missing money", "fraud", or "legal" — it escalates to a human support ticket automatically. Merchants see their open tickets in the chat panel and on the Overview dashboard.

### 🌙 Nightly Reconciliation Backstop
A `node-cron` job runs at 02:00 WAT every night. It pulls Nomba's `/transactions` for the previous day, diffs them against the local ledger, and surfaces any orphans (transactions on Nomba missing from the local DB — likely a dropped webhook) or amount drift. The same logic is callable on demand from the admin panel.

### 🔑 Merchant Auth & API Keys
- Email/password registration via Supabase Auth with email verification
- `nrk_live_*` prefixed API keys, stored as SHA-256 hashes — plaintext shown once
- Every marketplace-facing route accepts either `x-api-key` or `Authorization: Bearer <jwt>`
- Key rotation, revocation, and expiry supported

### 🏛️ Admin Panel
Internal ops panel at `/admin`, gated by `x-admin-secret`. Sections:
- **Overview** — system-wide stats across all merchants
- **Merchants** — full merchant list with suspend, reactivate, force-verify, revoke key, edit
- **Orders** — cross-merchant order list with filters and per-order detail drawer
- **Reconcile** — on-demand diff of Nomba transactions vs local ledger
- **Webhooks** — full inbound webhook event log
- **Health** — environment variable checklist, DB connectivity, memory, uptime
- **Tools** — bank account lookup, bulk expire, order reset
- **Support** — all escalated merchant support tickets with conversation history and resolve action
- **Danger** — nuclear option (wipes all orders and expires all VAs)

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
        │         Nomba API                   │
        │  Virtual Accounts · Transfers v2    │
        │  Webhooks · Transactions            │
        └─────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend API | Express (TypeScript) |
| Validation | Zod — schemas shared between frontend and backend |
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
| CI/CD | GitHub Actions → Railway (API) |

---

## API Reference

> All amounts are in **kobo** (₦1.00 = 100 kobo), matching Nomba's convention.

### Create an Order
```http
POST /api/v1/orders
x-api-key: nrk_live_...
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
`splits` is optional. Omit it entirely for reconciliation-only orders.

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

Full contract lives in `ROUTES.md`.

---

## Reconciliation Logic

```typescript
// packages/webhook-core/src/reconciler.ts
function classify(expectedKobo: number, receivedKobo: number): "paid" | "underpayment" | "overpayment" {
  if (receivedKobo === expectedKobo) return "paid";
  return receivedKobo < expectedKobo ? "underpayment" : "overpayment";
}
```

Webhook handler flow (simplified):
```
receive → verify HMAC → idempotency check → persist event
→ classify payment → update order → execute splits or settlement
→ notify merchant webhook → respond 200
```

---

## Project Structure

```
nairarails/
├── apps/
│   ├── web/                    # React + Vite — landing, onboarding, dashboard
│   │   └── src/
│   │       ├── pages/          # Landing, Onboarding, Login, Overview, Orders,
│   │       │                   # Exceptions, Settings, Admin, Docs
│   │       ├── components/     # SupportChat, HeroNetworkScene, ThemeToggle, StatusBadge
│   │       └── lib/            # apiFetch, money, queryClient, supabase
│   └── api/                    # Express backend
│       ├── src/routes/         # orders, webhooks, exceptions, dashboard,
│       │                       # merchants, auth, keys, support, admin
│       ├── src/middleware/     # apiKeyAuth, jwtAuth, authAny, rateLimiter, errorHandler
│       ├── src/lib/            # reconciliationCron, support-context, notifyMerchant, logger
│       ├── src/integrations/   # nombaClient.ts — all outbound Nomba calls
│       ├── src/scripts/        # seed.ts — demo data
│       └── prisma/             # schema.prisma
├── packages/
│   ├── shared-types/           # Zod schemas — API contract as code
│   └── webhook-core/           # Pure reconciliation logic + tests
│       └── src/tests/          # All 5 payment states tested in isolation
├── .env.example
├── ROUTES.md                   # Full API contract
├── DEPLOY.md                   # Railway deployment guide
└── DEVELOPMENT-HISTORY.md      # Build history across all cycles
```

---

## Setup

```bash
git clone https://github.com/your-repo/nairarails.git
cd nairarails
pnpm install

cp .env.example .env
# Fill in Nomba credentials, Supabase URLs, Gemini API key

pnpm dev        # starts API (port 3000) + web (port 5173)
```

**Required environment variables:**
```env
# Database
DATABASE_URL=          # Supabase transaction pooler (port 6543, ?pgbouncer=true)
DIRECT_URL=            # Supabase session pooler (port 5432, for migrations)

# Nomba
NOMBA_BASE_URL=https://api.nomba.com/v1
NOMBA_CLIENT_ID=
NOMBA_CLIENT_SECRET=
NOMBA_ACCOUNT_ID=
NOMBA_SUB_ACCOUNT_ID=  # webhooks only fire for VAs created via the sub-account route
NOMBA_WEBHOOK_SECRET=

# Supabase (server-side)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
ADMIN_SECRET=          # x-admin-secret header for /api/v1/admin/* routes
JWT_SECRET=

# AI Support
GEMINI_API_KEY=        # https://aistudio.google.com/app/apikey (free tier works)

# Frontend (VITE_* — browser-safe)
VITE_API_BASE=http://localhost:3000
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Optional
REDIS_URL=             # rate limiter (in-memory fallback if not set)
FRONTEND_URL=http://localhost:5173
```

**Seed demo data:**
```bash
pnpm --filter @nairarails/api db:push   # apply schema to DB
npx tsx --env-file=.env apps/api/src/scripts/seed.ts
```
Use `nrk_live_demo_seed_key` in the `x-api-key` header to authenticate as the demo merchant.

---

## Demo Flow

1. Open `/` — landing page explains the problem and product
2. Sign up at `/signup` → verify email → API key issued once
3. `POST /api/v1/orders` with your key → get a NUBAN back
4. In Nomba sandbox, send a transfer to that NUBAN
5. Webhook fires → dashboard updates in real time
6. Splits execute (or full settlement transfer if no splits)
7. Try an underpayment → shortfall flagged, splits blocked
8. Try an overpayment → excess quarantined, one-click refund in Exceptions

---

## Judging Criteria

| Criterion | NairaRails |
|---|---|
| **Reconciliation logic quality** | Per-VA matching, all 5 payment states handled explicitly, backed by isolated unit tests in `packages/webhook-core` |
| **Underpayment handling** | Funds held, shortfall calculated and surfaced, splits blocked until fully paid, one-click refund to buyer |
| **Overpayment handling** | Splits run on expected amount only, excess quarantined, one-click refund to sender from dashboard |
| **Customer-level reporting** | Live per-order status, collection rate chart, exception queue, full audit trail per order |
| **Infrastructure depth** | Nightly reconciliation backstop, outbound webhook signing, rate limiting, idempotency, AI support escalation |

---

## Out of Scope (Stated, Not Hidden)

- BVN/KYC verification
- Retry queue for failed outbound merchant webhooks (best-effort, logged on failure)
- Sub-accounts / persistent per-seller balances (settlement is per-order by design)
- Background job queue for webhook processing (synchronous, correct at this volume)

---

## The Insight

Nigeria processes a quadrillion naira digitally every year through infrastructure that still reconciles in spreadsheets. NairaRails doesn't fix the apps. It fixes the plumbing they run on.

---

*Built for the **Nomba × DevCareer Hackathon 2026** — Virtual Accounts as Infrastructure.*
