# NairaRails — Second-Cycle Sprint Plan

> Companion to `first-cycle-sprint.md`, `README.md`, `ROUTES.md`, and `DEPLOY.md`. The first cycle built the reconciliation engine, the webhook handler, the split-settlement logic, and the operator dashboard. It proved the core product works end-to-end.
>
> This cycle transforms NairaRails from a working demo into a believable product. The four additions — a 3D animated landing page, a merchant self-serve onboarding layer, a marketplace integration API (API keys, per-merchant context), and a polished operator dashboard — are what make judges see infrastructure, not a hackathon project.
>
> Same discipline as cycle one: each phase ends with a hard checkpoint. Don't start the next phase until the current checkpoint passes. Same rule on scope: nothing that only matters after certification is included here. Every phase note is explicit about what's being deliberately skipped.

---

## What Cycle One Delivered (Current State)

Before planning what's next, here is exactly what exists and is verified working:

- **Monorepo scaffold** — pnpm workspaces, Turborepo, shared tsconfig, `.env` wiring (Phase 0 ✅)
- **Shared types** — Zod schemas for orders, splits, reconciliation, webhook shapes, errors in `packages/shared-types` (Phase 1 ✅)
- **Pure reconciliation logic** — `classify()`, `calculateSplits()`, `verifyNombaWebhook()` with tests in `packages/webhook-core` (Phase 2 ✅)
- **Database schema** — `orders`, `splits`, `ledger_entries`, `webhook_events` tables in Supabase via Prisma (Phase 3 ✅)
- **Nomba integration layer** — `nombaClient.ts` with token caching, `createVirtualAccount`, `lookupBankAccount`, `transferToBank` (Phase 4 ✅)
- **Backend routes** — `POST /api/v1/orders`, `GET /api/v1/orders`, `GET /api/v1/orders/:ref/reconciliation`, `POST /api/v1/webhooks/nomba`, exceptions routes, dashboard overview, admin reconcile-check, health (Phases 5–6 ✅)
- **Operator dashboard** — React + Vite, TanStack Query, Tailwind, Overview / Orders / Exceptions pages against both mock and real backend (Phases 7–9 ✅)
- **Hardening pass** — signature verification live, idempotency confirmed, kobo amounts spot-checked, lookup-before-transfer enforced (Phase 10 ✅)
- **Seed data + demo rehearsal** — `seed.ts`, demo run confirmed (Phase 11 ✅)

---

## What This Cycle Builds

| Layer | What it is | Why it matters |
|---|---|---|
| **Landing page** | 3D animated React + Vite + GSAP + Three.js marketing page | Judges see this first. First impressions are a judging criterion even if unstated. |
| **Merchant onboarding** | Self-serve signup → API key issuance | Makes NairaRails feel like real infrastructure. Without it, the product has no entry point for real customers. |
| **Integration API** | API-key-authenticated endpoints for marketplaces | The actual surface a Jumia or Jiji developer builds against. Currently missing: no auth, no per-merchant context. |
| **Dashboard polish** | Connect landing → onboarding → dashboard; per-merchant data scoping | Ties all three layers together into a coherent product story. |

---

## Phase 12 — Landing Page: 3D Animated Hero

**Stack:** React, Vite, GSAP, Three.js (or React Three Fiber as a wrapper), Tailwind CSS

**This page lives at `apps/web/src/pages/LandingPage.tsx` (or a dedicated `apps/landing` if you want full separation — see note below).**

### What to build

The landing page is a single scrollable page with five sections. Each section exists to answer one question a judge has before they look at any code:

1. **Hero** — "What is NairaRails?" Three.js canvas in the background: a slowly rotating network of glowing nodes and edges, each node labelled with a bank name (Wema, GTB, Access, Nomba), with a payment pulse animation travelling along the edges when a user lands. Text overlay: the headline, the one-line pitch, a CTA button ("Get API Access" → scrolls to signup section).

2. **Problem** — "Why does this need to exist?" Animated counter rolling up to ₦35.56 billion (the documented reconciliation loss figure from the README). Two columns: "Before NairaRails" (a mocked-up spreadsheet image, a red annotation saying "Manual matching — 3 hours") vs "After NairaRails" (a green flow diagram showing VA → webhook → split in under 1 second).

3. **How it works** — "What does it actually do?" A three-step GSAP scroll-triggered animation: Step 1 (order created → VA issued) fades in, Step 2 (buyer pays → webhook fires) fades in as Step 1 locks into place, Step 3 (splits execute automatically) completes the sequence. Each step has a mini code snippet showing the one API call that triggers it.

4. **Integration** — "How do I use it?" A minimal code block showing the single `POST /api/v1/orders` call with the splits array. A tabbed view: Node.js, Python, cURL. This is the developer pitch — make it look like Stripe's docs.

5. **Signup CTA** — "How do I get started?" A minimal email + marketplace name form. On submit, this will call the merchant onboarding API (Phase 13). For now, wire it to a mock that returns a dummy API key — replace with the real endpoint in Phase 15.

### Implementation notes

- Use `@react-three/fiber` and `@react-three/drei` rather than raw Three.js — the abstraction cost is zero and it composes cleanly with React's rendering model.
- GSAP `ScrollTrigger` for the how-it-works section. Install `gsap` as a direct dependency of `apps/web`.
- All Three.js canvas work must be wrapped in `<Suspense>` with a fallback so slow machines don't show a blank screen.
- The landing page is a *public* route (`/`). The dashboard is gated behind onboarding (Phase 15). Add React Router to `apps/web` if it isn't already present — the routing structure becomes: `/` → Landing, `/signup` → Onboarding, `/dashboard` → existing pages (now protected).
- Performance: Three.js scenes are expensive on mobile. Add a `useReducedMotion` check and fall back to a static SVG diagram if the user has `prefers-reduced-motion` enabled or if `window.innerWidth < 768`.

**Explicitly not doing:** No CMS, no A/B testing, no analytics integration (Mixpanel, etc.), no i18n. One language, one variant, no tracking.

✅ **Checkpoint:** The landing page loads at `/` without console errors. The Three.js canvas renders on desktop Chrome and degrades gracefully (static fallback, no crash) on a throttled mobile simulation. GSAP scroll animations trigger correctly. The "Get API Access" CTA scrolls to the signup section. The page scores above 70 on Lighthouse performance (run once, fix the most obvious issues, move on — don't optimise indefinitely).

---

## Phase 13 — Merchant Onboarding: Database Layer

**Stack:** Prisma, Supabase

**Build:** Two new tables added to `apps/api/prisma/schema.prisma`:

```prisma
model Merchant {
  id           String   @id @default(cuid())
  name         String
  email        String   @unique
  apiKey       String   @unique @default(cuid())  // issued on signup, used on every API call
  webhookUrl   String?  // where NairaRails POSTs payment notifications back to them
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  orders       Order[]
}
```

```prisma
// Existing Order model gains a merchantId foreign key:
model Order {
  // ... existing fields unchanged ...
  merchantId   String
  merchant     Merchant @relation(fields: [merchantId], references: [id])
}
```

### Migration

Run `pnpm --filter @nairarails/api db:push` for local dev, `db:migrate` for any deployed environment.

### Why this comes before the routes (Phase 14)

Same reason Phase 3 came before Phase 5 in the first cycle: the routes need a real table. Don't mock the database twice.

**Explicitly not doing:** No password hashing, no session tokens, no email verification, no OAuth. The API key is the credential — that's all the demo needs. Password-based auth is a production concern.

✅ **Checkpoint:** `pnpm --filter @nairarails/api db:push` applies cleanly. The `Merchant` table is visible in the Supabase table editor with the correct columns. The `Order` table has a `merchantId` column. Existing seed data still loads without foreign-key errors (update `seed.ts` to create a seed merchant and attach existing orders to it).

---

## Phase 14 — Merchant Onboarding: API Routes

**Stack:** Express, Zod, `packages/shared-types`

**Build:** New route file `apps/api/src/routes/merchants.ts`, mounted at `/api/v1/merchants`.

### Endpoints

**`POST /api/v1/merchants/signup`** — public, no auth required

Request body (add `MerchantSignupSchema` to `packages/shared-types`):
```json
{
  "name": "Jumia Foods",
  "email": "dev@jumiafood.ng",
  "webhookUrl": "https://jumiafood.ng/webhooks/nairarails"
}
```

Response `201`:
```json
{
  "merchantId": "clx...",
  "name": "Jumia Foods",
  "apiKey": "nrk_live_clx...",
  "message": "Store your API key securely — it will not be shown again."
}
```

Behaviour:
- Validate with Zod. `webhookUrl` is optional.
- Generate a `cuid()` as the `apiKey`. Prefix it `nrk_live_` so it's immediately recognisable in logs.
- Insert the merchant row.
- Return the API key **once** in the 201 response. Never return it again from any other endpoint — this is standard infrastructure behaviour (Stripe, Nomba itself) and judges will recognise it.
- 409 if email already registered (`DUPLICATE_MERCHANT_EMAIL`).

**`GET /api/v1/merchants/me`** — authenticated (requires `x-api-key` header, see Phase 15)

Returns the merchant's own profile: `{ merchantId, name, email, webhookUrl, createdAt }`. The `apiKey` field is never returned after the initial 201.

**Explicitly not doing:** No API key rotation endpoint, no webhook secret per merchant (the Nomba webhook secret is system-level, not per-merchant), no usage metering. All post-launch concerns.

✅ **Checkpoint:** `POST /api/v1/merchants/signup` with a valid body returns a 201 with a prefixed API key. A second call with the same email returns 409. The row is visible in Supabase.

---

## Phase 15 — API Key Middleware & Per-Merchant Context

**Stack:** Express middleware

**Build:** `apps/api/src/middleware/apiKeyAuth.ts`

```typescript
export async function apiKeyAuth(req, res, next) {
  const key = req.headers["x-api-key"];
  if (!key) return res.status(401).json({ error: "MISSING_API_KEY" });

  const merchant = await prisma.merchant.findUnique({ where: { apiKey: key } });
  if (!merchant) return res.status(401).json({ error: "INVALID_API_KEY" });

  res.locals.merchant = merchant;  // available to all downstream handlers
  next();
}
```

### Apply to existing routes

All routes that marketplace developers call must now require an API key:

- `POST /api/v1/orders` — `apiKeyAuth` middleware added. The handler reads `res.locals.merchant.id` and writes it as `merchantId` on the new order row.
- `GET /api/v1/orders` — `apiKeyAuth` added. Query filtered to `WHERE merchantId = res.locals.merchant.id`.
- `GET /api/v1/orders/:ref/reconciliation` — `apiKeyAuth` added. 404 if the order doesn't belong to the calling merchant.
- `GET /api/v1/exceptions` — `apiKeyAuth` added. Filtered to caller's merchant.
- `POST /api/v1/exceptions/:ref/refund-excess` — `apiKeyAuth` added. Validates ownership before refund.

### Routes that remain public (no API key)

- `POST /api/v1/merchants/signup` — by definition unauthenticated
- `POST /api/v1/webhooks/nomba` — Nomba calls this, not the marketplace. Authenticated by HMAC signature, not API key.
- `GET /api/v1/health` — always public
- `GET /api/v1/dashboard/*` — see Phase 16

### Seed data update

Update `seed.ts` to include a demo merchant with a known, fixed API key (e.g. `nrk_live_demo_seed_key`) so the dashboard and Postman tests don't break after this migration.

**Explicitly not doing:** No rate limiting per API key, no IP allowlisting, no scoped permissions (read-only vs read-write keys). Single-scope keys, correct at hackathon scale.

✅ **Checkpoint:** `POST /api/v1/orders` without `x-api-key` returns 401. With the seed merchant's key it returns 201 and the created order has `merchantId` set. `GET /api/v1/orders` with Merchant A's key does not return Merchant B's orders. Existing `POST /api/v1/webhooks/nomba` HMAC test still passes — the webhook route is untouched.

---

## Phase 16 — Dashboard: Auth Flow & Merchant Scoping

**Stack:** React, React Router, TanStack Query

**This phase connects the three layers built in Phases 12–15 into a single coherent user journey.**

### Routing structure (update `apps/web/src/main.tsx`)

```
/                  → LandingPage      (public)
/signup            → OnboardingPage   (public)
/dashboard         → redirect → /dashboard/overview
/dashboard/overview → OverviewPage    (requires apiKey in localStorage)
/dashboard/orders  → OrdersPage       (requires apiKey in localStorage)
/dashboard/exceptions → ExceptionsPage (requires apiKey in localStorage)
```

A `<ProtectedRoute>` wrapper checks for `apiKey` in `localStorage`. If missing, redirect to `/signup`.

### `OnboardingPage.tsx`

A clean, minimal form:
- Fields: Marketplace name, Email, Webhook URL (optional)
- On submit: `POST /api/v1/merchants/signup`
- On 201: store the returned `apiKey` in `localStorage` as `nairarails_api_key`. Show the key in a styled "copy-to-clipboard" box with a warning: "This is the only time your key will be shown." Then redirect to `/dashboard/overview` after 3 seconds (or immediately on a "Go to dashboard" button click).
- On 409: show "This email is already registered."

### `apiFetch.ts` update

Read `localStorage.getItem("nairarails_api_key")` and attach it as `x-api-key` on every request to `/api/v1/*` (skip for `/merchants/signup` and `/webhooks/*`).

### Dashboard pages

The existing Overview, Orders, and Exceptions pages already work — they just need the `x-api-key` header flowing through `apiFetch`. No page logic changes needed if `apiFetch` is updated correctly.

**Explicitly not doing:** No JWT, no refresh tokens, no server-side sessions. localStorage API key is intentionally simple — this is a developer-facing tool and judges understand the tradeoff. State "localStorage is intentionally used here for hackathon simplicity; production would use a secure HttpOnly session" in the README if asked.

✅ **Checkpoint:** Full user journey works end-to-end in the browser: land on `/` → click CTA → `/signup` → fill form → see API key → auto-redirect to `/dashboard/overview` → data loads scoped to that merchant. Refreshing `/dashboard/overview` without a key in storage redirects to `/signup`. The existing ROUTES.md manual test sequence still passes using the seed merchant's API key in the `x-api-key` header.

---

## Phase 17 — Outbound Webhooks to Merchants

**Stack:** Express, native `fetch`

**When a payment is classified in the webhook handler, NairaRails should notify the marketplace's own backend — this is what makes it feel like a platform, not a tool.**

### Build: `apps/api/src/lib/notifyMerchant.ts`

```typescript
export async function notifyMerchant(merchant: Merchant, payload: MerchantWebhookPayload) {
  if (!merchant.webhookUrl) return;  // merchant didn't register a webhook — skip silently

  try {
    await fetch(merchant.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),  // 5s hard timeout — never block the main flow
    });
  } catch (err) {
    // Log and move on. A failed outbound webhook must never crash our inbound handler.
    console.error("[notifyMerchant] delivery failed", { url: merchant.webhookUrl, err });
  }
}
```

### Payload shape (add `MerchantWebhookPayloadSchema` to `packages/shared-types`)

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

### Wire into the webhook handler

After `executeSplits()` (or after classification for underpayment/overpayment), call `notifyMerchant(order.merchant, payload)`. This call is fire-and-forget — never `await` it in a way that can delay the `200` response back to Nomba.

**Explicitly not doing:** No retry queue for failed merchant webhook deliveries, no per-merchant webhook signing secret (single-scope for now), no delivery log UI. These are production concerns. The call is best-effort and logged on failure.

✅ **Checkpoint:** Create an order for a merchant whose `webhookUrl` points at a `RequestBin` or `webhook.site` URL. Trigger a payment. Confirm the `payment.classified` payload arrives at that URL within 5 seconds of Nomba's webhook being processed. Confirm a failed/unreachable `webhookUrl` doesn't crash the inbound webhook handler or delay the `200` to Nomba.

---

## Phase 18 — Landing Page Polish & Demo Readiness

**Stack:** No new stack — this phase is integration and presentation work**

### What to do

1. **End-to-end route smoke test** — walk every route in `ROUTES.md` with the real deployed stack. Fix any regressions introduced by the API key middleware in Phase 15. Produce a clean Thunder Client run with zero failures.

2. **Seed data refresh** — update `seed.ts` to include:
   - One demo merchant with a fixed API key
   - At least 5 orders in varied states (pending, paid, underpayment, overpayment, unmatched) belonging to that merchant
   - Split rows and ledger entries correctly attached
   - The demo merchant's `webhookUrl` set to a live `webhook.site` endpoint for the live demo

3. **Landing page final pass** — ensure the "Get API Access" CTA and the signup form on the landing page point at the real `POST /api/v1/merchants/signup` endpoint (not the mock wired in Phase 12). The full journey — landing → signup → dashboard — should work live.

4. **README update** — add a new section documenting the second-cycle additions:
   - How to visit the landing page
   - How to sign up as a merchant and get an API key
   - Updated environment variables if any were added
   - A brief "Second Cycle" entry in the project structure block

5. **Demo rehearsal** — run the full judge-facing demo sequence at least twice, live, against the real deployed stack:
   - Open landing page → pitch the problem in 30 seconds while the Three.js animation runs
   - Sign up as a new merchant → copy API key
   - Create an order via the dashboard (or show the API call)
   - Pay the NUBAN → watch the webhook fire → watch the dashboard update → show splits executed
   - Trigger an overpayment → show it in the exceptions queue → click refund → show the Nomba transfer ref
   - Show the merchant's own webhook URL received the `payment.classified` notification

**Explicitly not doing:** No load testing, no penetration testing, no accessibility audit beyond what was already done in cycle one.

✅ **Checkpoint:** The full demo sequence runs successfully twice, live, by the person presenting. Every page loads without console errors. The README accurately describes the current state of the project. The deployed API's `/health` returns `200`.

---

## Phase 19 — Hardening Pass (Second-Cycle Specifics)

**Stack:** No new stack — verification pass only**

Run through these items that are specific to cycle-two additions. The cycle-one hardening checklist (Phase 10) already covers the core engine — don't re-run that, it passed.

- [ ] `POST /api/v1/merchants/signup` cannot be used to enumerate existing emails (confirm: both success and "email already registered" responses return in a similar time — no timing oracle)
- [ ] API key is never logged anywhere in the codebase (`grep -r "apiKey" apps/api/src` — confirm only Prisma model references and the one issuance point, no `console.log` of the raw key value)
- [ ] `notifyMerchant` never throws into the inbound webhook handler (test by setting `webhookUrl` to `http://localhost:9999` — an unreachable address — and confirming the Nomba webhook still returns 200)
- [ ] Landing page has no hardcoded credentials, API URLs are read from `VITE_API_BASE` env var
- [ ] The seed merchant's API key (`nrk_live_demo_seed_key`) is in `.env.example` with a comment marking it as demo-only — not a real credential
- [ ] `pnpm turbo run test` still passes all Phase 2 tests after all the schema and middleware changes

✅ **Checkpoint:** Every item above checked off, not assumed.

---

## Suggested Pacing

| Day | Phases | Notes |
|---|---|---|
| 1 | 12 | Landing page — this is the most open-ended visual work and benefits from a full day. Get the Three.js hero working first; the other sections are progressively lower-risk. |
| 2 | 13, 14 | DB schema + merchant signup API. Short phases individually; together they're a full day when you include migration, testing, and the seed data update. |
| 3 | 15, 16 | API key middleware + dashboard auth flow. These are tightly coupled — do them back-to-back on the same day so you can test the full flow before sleeping. |
| 4 | 17, 18 | Outbound webhooks + integration pass + seed refresh + live demo rehearsal (first run). |
| 5 | 19, 18 (second rehearsal) | Hardening pass. Second demo rehearsal. README update. Any visual polish on the landing page if time allows. |

Day 3 is the highest-risk day — it touches existing routes with a new auth layer, which can introduce regressions. Budget time for debugging. The ROUTES.md manual test collection is your regression suite.

---

## Architecture After Cycle Two

```
┌──────────────────────────────────────────────────────────────────┐
│                      Landing Page (/)                            │
│            Three.js + GSAP — the pitch, the first impression     │
└──────────────────────────────┬───────────────────────────────────┘
                               │ "Get API Access" CTA
┌──────────────────────────────▼───────────────────────────────────┐
│                   Merchant Onboarding (/signup)                  │
│         POST /api/v1/merchants/signup → API key issued           │
└──────────────────────────────┬───────────────────────────────────┘
                               │ API key stored in localStorage
┌──────────────────────────────▼───────────────────────────────────┐
│              Operator Dashboard (/dashboard/*)                   │
│     x-api-key header on every request — per-merchant data        │
│     Overview · Orders · Exceptions                               │
└──────────────────────────────┬───────────────────────────────────┘
                               │ REST API (x-api-key authenticated)
┌──────────────────────────────▼───────────────────────────────────┐
│                   NairaRails API (Express)                        │
│                                                                   │
│  apiKeyAuth middleware → merchant context on res.locals          │
│                                                                   │
│  POST /merchants/signup  (public)                                │
│  POST /orders            (authenticated)                         │
│  GET  /orders            (authenticated, merchant-scoped)        │
│  POST /webhooks/nomba    (HMAC-only, no API key)                 │
│  GET  /exceptions        (authenticated, merchant-scoped)        │
│  GET  /dashboard/*       (authenticated, merchant-scoped)        │
│                                                                   │
│              ┌──────────────────────────────┐                    │
│              │   notifyMerchant()           │                    │
│              │   fire-and-forget POST       │                    │
│              │   to merchant.webhookUrl     │                    │
│              └──────────────┬───────────────┘                    │
└──────────────────────────────┼───────────────────────────────────┘
                               │
               ┌───────────────▼──────────────────┐
               │   Nomba API (sandbox)             │
               │   Virtual Accounts · Transfers    │
               │   Webhooks                        │
               └──────────────────────────────────┘

               ┌──────────────────────────────────┐
               │   PostgreSQL (Supabase)           │
               │   merchants · orders · splits     │
               │   ledger_entries · webhook_events │
               └──────────────────────────────────┘

               ┌──────────────────────────────────┐
               │   Marketplace Backend             │
               │   (Jumia, Jiji, etc.)             │
               │   receives payment.classified     │
               │   webhook from notifyMerchant()   │
               └──────────────────────────────────┘
```

---

## New Environment Variables

No new secrets required. One optional addition:

```env
# Optional: set to a webhook.site or requestbin URL for local testing of outbound merchant notifications
DEMO_MERCHANT_WEBHOOK_URL=
```

Add this to `.env.example` with a comment.

---

## Explicitly Out of Scope (Cycle Two)

- Password-based merchant login / session management (API key is the credential)
- API key rotation / revocation endpoint
- Per-merchant webhook signing secrets
- Rate limiting per API key
- Email delivery (signup confirmation, payment notification emails)
- Multi-user access per merchant account (one key, one merchant, for now)
- Retry queue for failed outbound merchant webhooks
- Any mobile app or React Native work
- Production KYC / BVN verification

---

*NairaRails — programmable payment infrastructure for Nigeria's next growth wave.*
