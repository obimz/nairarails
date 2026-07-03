# NairaRails 🛤️

> **Every naira has an address. Every settlement has a rule. Every exception is caught before it becomes a crisis.**

NairaRails is programmable payment infrastructure for Nigerian marketplace commerce: every order gets its own bank account, so a single chaotic pool of incoming transfers becomes fully traceable, automatically reconciled, and instantly split between sellers, platforms, and riders.

Built on Nomba's Virtual Account API for the Nomba x DevCareer Hackathon 2026 — **Build Track, Virtual Accounts as Infrastructure.**

---

## The Problem

Nigeria processed **₦1.07 quadrillion** in digital transactions in 2024 — but marketplace payments still reconcile manually.

A marketplace operator today receives payments into a single shared bank account. Every transfer shows a sender name and an amount — nothing else. A finance officer spends hours manually matching "Chidi Obi — ₦45,000" against 200 open orders. When the split goes to the seller, rider, and platform, it happens in a spreadsheet the next morning. When someone pays ₦48,000 instead of ₦50,000, the shortfall gets credited in full and quietly disappears. When NIBSS hiccupped in September 2024, ₦13.66 billion was posted without a corresponding debit — and nobody caught it at the application layer until Monday morning.

**₦35.56 billion** was lost to publicly documented reconciliation failures in Nigeria between 2023 and 2024.

Every marketplace either builds this reconciliation layer themselves, badly, or doesn't build it at all.

---

## What NairaRails Does

NairaRails assigns every order on a marketplace its own **unique virtual account number** (NUBAN), backed by a real Nigerian bank via Nomba. The moment a buyer pays, a webhook fires and NairaRails takes over:

1. **Matches** the payment to the exact order — zero manual lookup
2. **Classifies** it: exact match, underpayment, or overpayment
3. **Routes** it instantly: seller's cut, platform fee, delivery rider — all split in the same settlement cycle
4. **Reports** it: the operator sees a live dashboard with every order's payment status, every exception, and every naira's current location

No spreadsheets. No batch jobs. No Monday morning surprises.

Marketplaces integrate with one API call where they already create orders, and either consume a webhook or check the dashboard for status — no changes to their existing checkout flow, no reconciliation engine of their own to build.

---

## Core Features

### 🏦 Per-Order Virtual Accounts
Every order gets a unique Nomba virtual account at creation. When payment arrives, the system already knows which order it belongs to — no human matching required. Settlement happens per-order, not as an accumulating per-seller balance, which is why NairaRails uses Virtual Accounts and Transfers directly rather than Nomba's Sub-accounts API — there's no persistent balance that needs holding.

### ⚡ Real-Time Webhook Reconciliation
Every `virtual_account.funded` event triggers an immediate classification:
- **Exact match** → mark paid, route funds, notify parties
- **Underpayment** → hold, notify buyer of shortfall, flag for follow-up
- **Overpayment** → mark paid, quarantine excess, one-click refund action available to ops
- **Unmatched payment** → quarantine immediately, alert finance team — nothing disappears silently
- **Duplicate delivery** → ignored via idempotency check on Nomba's `requestId` — webhooks may fire twice, and every external write is keyed on a unique reference so nothing is ever double-applied

### 💸 Instant Split-Settlement
Marketplace splits execute the moment payment is classified as paid — not in a batch job the next day. Configure any split at order creation:

```json
{
  "splits": [
    { "party": "seller",   "percentage": 85 },
    { "party": "platform", "percentage": 10 },
    { "party": "rider",    "percentage": 5  }
  ]
}
```

Each party's bank account is verified via Nomba's account-lookup endpoint before any transfer is sent — sending to a wrong NUBAN can be irreversible, so the resolved account name is confirmed before money moves. Each party then receives their portion in the same settlement cycle.

### 📊 Customer-Level Reporting Dashboard
Because every naira has a tagged virtual account and a purpose, NairaRails generates a live financial view automatically:
- Total expected vs received today
- Per-order payment status (paid / underpayment / pending / overpayment)
- Exception queue — every discrepancy with its current state and assigned action
- Full audit trail — every webhook event, every classification decision, every fund movement

### 🛡️ Hardened Webhook Engine
- HMAC-SHA256 signature verification on every event, computed against the raw request body and checked with a timing-safe comparison
- Idempotency keys — every payment processed exactly once, enforced by a unique database constraint on Nomba's `requestId`
- Immediate `200` acknowledgement once an event is safely recorded — including unmatched and duplicate cases, so Nomba never retries an event that's already been handled
- Full event log retained for every webhook received — evidence in any dispute

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Marketplace App                    │
│         (order creation → payment request)          │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│                NairaRails API (Express)              │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  VA Engine  │  │ Webhook      │  │  Reconciler│ │
│  │  (Nomba VA  │  │ Handler      │  │  (classify,│ │
│  │   API)      │  │ (HMAC +      │  │  split     │ │
│  │             │  │  idempotency)│  │  math)     │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                │                │         │
│  ┌──────▼────────────────▼────────────────▼──────┐  │
│  │             PostgreSQL (Supabase)              │  │
│  │   orders · splits · ledger_entries ·           │  │
│  │   webhook_events (idempotency)                 │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │                           │
│  ┌──────────────────────▼───────────────────────┐  │
│  │         Split-Settlement via Transfers        │  │
│  │  lookup recipient → transfer → log result     │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │                           │
│  ┌──────────────────────▼───────────────────────┐  │
│  │           Reporting API → Dashboard           │  │
│  │   React dashboard — live, per-order view      │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                          │
        ┌─────────────────▼──────────────────┐
        │     Nomba API (sandbox.api.nomba.com)│
        │  Virtual Accounts · Transfers        │
        │  Webhooks · Transactions             │
        └────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Backend API | Express (TypeScript) |
| Validation | Zod — schemas shared between frontend and backend |
| Database | PostgreSQL via Supabase (direct connection, session pooler) |
| ORM | Drizzle |
| Frontend Dashboard | React + Vite, TanStack Query, Tailwind CSS, Recharts |
| Payment Infrastructure | Nomba Virtual Account API, Transfers API, Webhooks, Transactions API |
| Testing | Vitest |
| Webhook Security | HMAC-SHA256 signature verification (raw body, hex digest) |

No Redis, no background job queue, no Sub-accounts API — deliberately. See **Explicitly Out of Scope** below.

---

## API Reference

> Internal amounts are always in **kobo** (₦1.00 = 100 kobo), matching Nomba's own convention, to avoid unit-conversion bugs at the API boundary.

### Create a Virtual Account for an Order
```http
POST /api/v1/orders
```
```json
{
  "order_ref": "ord_9821",
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

**Response:**
```json
{
  "order_ref": "ord_9821",
  "virtual_account_number": "9900012345",
  "bank_name": "Nomba",
  "expected_amount_kobo": 5000000,
  "currency": "NGN",
  "status": "pending",
  "created_at": "2026-06-28T09:00:00Z"
}
```

### Webhook Event (Nomba → NairaRails)
```http
POST /api/v1/webhooks/nomba
```
```json
{
  "event": "virtual_account.funded",
  "requestId": "req_3f9a2c",
  "data": {
    "merchantTxRef": "ord_9821",
    "amount": 4800000,
    "currency": "NGN",
    "senderName": "Emeka Okafor",
    "senderAccountNumber": "0123456789",
    "senderBankCode": "058"
  }
}
```

Verified against the `nomba-signature` header: `HMAC-SHA256(webhookSecret, rawRequestBody)`, hex-encoded.

### Get Order Reconciliation Status
```http
GET /api/v1/orders/{order_ref}/reconciliation
```
```json
{
  "order_ref": "ord_9821",
  "virtual_account_number": "9900012345",
  "expected_amount_kobo": 5000000,
  "received_amount_kobo": 4800000,
  "status": "underpayment",
  "shortfall_kobo": 200000,
  "excess_kobo": 0,
  "splits_executed": false,
  "splits": [
    { "party": "seller",   "percentage": 85, "amount_paid_kobo": null, "status": "blocked" },
    { "party": "platform", "percentage": 10, "amount_paid_kobo": null, "status": "blocked" },
    { "party": "rider",    "percentage": 5,  "amount_paid_kobo": null, "status": "blocked" }
  ],
  "audit_trail": [
    { "event": "va_created",       "timestamp": "2026-06-28T09:00:00Z" },
    { "event": "payment_received", "amount_kobo": 4800000, "timestamp": "2026-06-28T14:32:11Z" },
    { "event": "classified",       "status": "underpayment", "timestamp": "2026-06-28T14:32:11Z" }
  ]
}
```

### Exceptions Queue
```http
GET /api/v1/exceptions?type=overpayment
POST /api/v1/exceptions/{order_ref}/refund-excess
```

Full contract, including error shapes and all endpoint variants, lives in `01-API-CONTRACT.md`.

---

## Reconciliation Logic

```typescript
// packages/webhook-core/src/reconciler.ts
function classify(expectedKobo: number, receivedKobo: number): "paid" | "underpayment" | "overpayment" {
  if (receivedKobo === expectedKobo) return "paid";
  return receivedKobo < expectedKobo ? "underpayment" : "overpayment";
}
```

```typescript
// apps/api/src/routes/webhooks.ts (simplified)
async function handleWebhook(event: NombaWebhookEvent) {
  if (!verifyNombaWebhook(rawBody, signatureHeader, secret)) return res.status(401);

  if (await webhookEventExists(event.requestId)) {
    return res.status(200).json({ status: "duplicate_ignored" });
  }
  await recordWebhookEvent(event.requestId, event);

  const order = await findOrderByRef(event.data.merchantTxRef);
  if (!order) {
    await quarantineUnmatched(event);
    return res.status(200).json({ status: "unmatched_quarantined" });
  }

  const status = classify(order.expectedAmountKobo, event.data.amount);
  await updateOrderStatus(order.orderRef, status, event.data.amount);

  if (status === "paid" || status === "overpayment") {
    await executeSplits(order.orderRef, order.expectedAmountKobo); // splits the expected portion only
  }

  return res.status(200).json({ status: "ok" });
}
```

Full implementation detail, including the lookup-before-transfer step, lives in `02-BACKEND-GUIDE.md`.

---

## Demo Scenario

**A buyer orders food on a NairaRails-powered delivery marketplace.**

1. Order created → NairaRails issues a unique virtual account `9900012345` via Nomba sandbox
2. Buyer transfers ₦50 to that account number (sandbox amount, scaled down from the ₦5,000 business scenario to respect sandbox limits)
3. Payment settles → Nomba fires `virtual_account.funded` webhook
4. NairaRails verifies the signature, checks idempotency, classifies: **exact match**
5. Transfers API fires for each party, each preceded by a recipient lookup:
   - 85% → Restaurant's account
   - 10% → Platform wallet
   - 5% → Rider's account
6. Dashboard updates in real time — order marked paid, splits logged, audit trail complete

**Total human intervention required: zero.**

A second live run demonstrates an underpayment (shortfall held and flagged) and an overpayment (excess quarantined, refunded live via the dashboard's one-click action).

---

## Project Structure

```
nairarails/
├── apps/
│   ├── web/                  # React + Vite dashboard + landing page
│   │   └── src/
│   │       ├── pages/        # LandingPage, OnboardingPage, Orders, Exceptions, Overview
│   │       ├── components/   # ProtectedRoute, HeroNetworkScene, StatusBadge
│   │       └── lib/          # apiFetch (x-api-key injection), money, queryClient
│   └── api/                  # Express backend
│       ├── src/routes/       # orders, webhooks, exceptions, dashboard, merchants
│       ├── src/middleware/   # apiKeyAuth, validate, errorHandler, CORS
│       ├── src/lib/          # notifyMerchant, logger
│       ├── src/db/           # Prisma schema + Supabase connection
│       ├── src/integrations/ # nombaClient.ts — all outbound Nomba calls
│       └── src/scripts/      # seed.ts — demo data for dashboard
├── packages/
│   ├── shared-types/         # Zod schemas — the API contract, as code
│   └── webhook-core/         # Pure signature verification + reconciler + split math
│       └── tests/            # All 5 payment states tested in isolation
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

Full structure rationale lives in the implementation guides — notably why webhook *logic* lives in `packages/webhook-core` (pure, unit-testable) while the webhook *route* lives in `apps/api` (the actual HTTP listener).

---

## Second Cycle Additions

The second cycle transformed NairaRails from a working demo into a believable product.

### Landing Page (`/`)
3D animated React page powered by Three.js + GSAP. Includes a network animation of bank nodes with payment pulses, problem framing with the ₦35.56B reconciliation loss figure, a how-it-works walkthrough, and a "Get API Access" CTA leading to merchant onboarding.

Degrades gracefully — users with `prefers-reduced-motion` or viewport width below 768px see a static fallback with no crash.

### Merchant Onboarding (`/signup`)
Self-serve signup: marketplace name, email, and optional webhook URL. On success, an `nrk_live_*` prefixed API key is issued **once** and shown in a copy-to-clipboard box. The key is stored in `localStorage` and injected into every subsequent API request.

```http
POST /api/v1/merchants/signup
```
```json
{ "name": "Jumia Foods", "email": "dev@jumiafood.ng", "webhookUrl": "https://jumiafood.ng/webhooks/nairarails" }
```

### API Key Authentication
Every marketplace-facing route now requires an `x-api-key` header. Each merchant sees only their own orders, exceptions, and dashboard stats.

```http
GET /api/v1/orders
x-api-key: nrk_live_...
```

Routes that remain public: `POST /merchants/signup`, `POST /webhooks/nomba`, `GET /health`.

### Outbound Merchant Webhooks
After each payment is classified, NairaRails POSTs a `payment.classified` event to the merchant's registered `webhookUrl`. Fire-and-forget — a failed delivery never crashes the inbound webhook handler or delays Nomba's `200`.

```json
{
  "event": "payment.classified",
  "order_ref": "ord-001",
  "status": "paid",
  "received_amount_kobo": 500000,
  "expected_amount_kobo": 500000,
  "splits_executed": true,
  "timestamp": "2026-07-03T10:00:00Z"
}
```

### Protected Dashboard
The dashboard now requires a valid API key in `localStorage`. Navigating to `/dashboard` without one redirects to `/signup`. A Sign out button clears the key and returns to signup.

---

## Environment Setup

```bash
git clone https://github.com/your-team/nairarails.git
cd nairarails
pnpm install

cp .env.example .env
# Add your Nomba sandbox credentials and Supabase connection string

pnpm dev  # runs apps/web and apps/api together via Turborepo
```

**Required environment variables:**
```env
NOMBA_BASE_URL=https://sandbox.nomba.com/v1
NOMBA_CLIENT_ID=
NOMBA_CLIENT_SECRET=
NOMBA_ACCOUNT_ID=        # parent account ID — sent in the accountId header on every request
NOMBA_SUB_ACCOUNT_ID=    # sub-account ID — used as path param in /accounts/virtual/{subAccountId}
                         # webhooks only fire when virtual accounts are created via the subaccount
                         # route; the generic /accounts/virtual endpoint provisions the account
                         # but Nomba never delivers webhook events for it
NOMBA_WEBHOOK_SECRET=
DATABASE_URL=
DIRECT_URL=
VITE_API_BASE=http://localhost:3000
```

**Optional (demo / seed):**
```env
# Set to a webhook.site URL to observe outbound payment notifications during a live demo
DEMO_MERCHANT_WEBHOOK_URL=
```

To seed demo data (5 orders across all payment states):
```bash
npx tsx --env-file=.env apps/api/src/scripts/seed.ts
```
Use API key `nrk_live_demo_seed_key` in the `x-api-key` header to authenticate as the demo merchant.

---

## Why NairaRails Wins on the Judging Criteria

| Judging Criterion | NairaRails Response |
|---|---|
| **Reconciliation logic quality** | Per-VA matching, every payment state handled explicitly — exact, under, over, unmatched, duplicate — backed by isolated unit tests |
| **Underpayment & overpayment handling** | Underpayments held and buyer notified; overpayments quarantined with one-click ops refund — nothing absorbed silently |
| **Customer-level reporting clarity** | Live dashboard with per-order status, exception queue, and full audit trail |

---

## Explicitly Out of Scope (Stated, Not Hidden)

- Password-based login / session management — API key is the credential; localStorage is used intentionally for hackathon simplicity (production would use a secure HttpOnly session)
- API key rotation / revocation endpoint
- Sub-accounts / persistent per-seller balances — settlement is per-order, not an accumulating balance, so there's no balance for a sub-account to hold
- Background job queue for webhook processing — handled synchronously, correct at hackathon transaction volume
- Retry queue for failed outbound merchant webhooks — best-effort delivery, logged on failure
- Real BVN/KYC verification
- Scheduled nightly reconciliation job — the reconciliation-backstop logic exists and is callable on demand against Nomba's Transactions API, but isn't wired to a cron scheduler

---

## The Insight

Nigeria processes a quadrillion naira digitally every year through infrastructure that still reconciles in spreadsheets. NairaRails doesn't fix the apps. It fixes the plumbing they run on.

---

## Team

Built for the **Nomba x DevCareer Hackathon 2026** — Build Track, Virtual Accounts as Infrastructure.

---

*NairaRails — programmable payment infrastructure for Nigeria's next growth wave.*