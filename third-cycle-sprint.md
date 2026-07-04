# NairaRails — Third-Cycle Sprint Plan

> Companion to `first-cycle-sprint.md` and `second-cycle-sprint.md`. The first cycle built the reconciliation engine and the core product. The second cycle layered production auth, key hardening, rate limiting, CI/CD, and observability.
>
> This cycle focuses on merchant experience, UI quality, and making the reconciliation model actually actionable. It also hardens the auth flow from a raw API-key credential store into a proper business registration system.
>
> Same discipline as the prior cycles: each phase ends with a hard checkpoint. Explicitly states what is skipped and why.

---

## Current State Audit

### What's Working
- Per-order virtual accounts via Nomba, full webhook → classify → split pipeline
- HMAC signature verification, idempotency, ledger entries
- React dashboard: Overview, Orders, Exceptions pages
- Landing page with Three.js hero, merchant signup, API-key auth
- Outbound merchant webhooks (`payment.classified` events)
- Seed data, Thunder Client collection, deployed to Railway + Vercel

### What This Cycle Fixes

| Problem | Impact |
|---|---|
| Docs are a single `DocsPage.tsx` hardcoded React component — not real docs | Merchants can't read, search, or link to specific sections easily |
| Docs expose Nomba webhook internals (signature fields, `vact_transfer`, `aliasAccountReference`) | Merchants don't need to know our vendor; it's confusing and irrelevant to them |
| Landing page, login, signup, and dashboard all use oversized typography | Visually heavy; doesn't feel like a modern SaaS product |
| Login and signup lack a minimal, modern SaaS aesthetic | Current feel is closer to a hackathon demo than a product merchants would trust |
| Reconciliation on the dashboard is read-only — merchants can see exceptions but can't act on them | The most actionable part of the product has no actions wired to it |
| Underpayments are held indefinitely with no refund path | Buyer has no recourse; merchant has no automated resolution |
| Auth is just an API key pasted into localStorage — no business identity, no expiry, no revocation | Not credible as infrastructure; a leaked key is permanent |

---

## Reconciliation Logic — Current Behaviour (Plain English)

This section answers the question: *what does the system actually do today when a payment comes in?*

### What happens on each classification

**Exact match (`paid`)**
The received amount equals the expected amount exactly. The system immediately executes splits — transfers go to seller, platform, and rider in the same webhook cycle. Order is marked `paid`. Nothing else required.

**Overpayment**
The received amount is greater than expected. The system still executes splits on the *expected* amount only — the seller gets paid correctly. The *excess* is quarantined (no transfer is made for it). Order is marked `overpayment`. The merchant can see this in the Exceptions queue and trigger a refund-to-buyer via `POST /exceptions/:order_ref/refund-excess`, which calls Nomba Transfers to send the excess back to the original sender account. After refund, order is marked `paid`.

**What the dashboard currently offers:** The Exceptions page *lists* overpayment orders with the excess amount. A "Refund Excess" button exists in the UI but — critically — it is **not wired to the API endpoint**. The `POST /exceptions/:order_ref/refund-excess` endpoint is fully implemented on the backend and works correctly; the frontend just never calls it. This is the gap.

**Underpayment**
The received amount is less than expected. The system holds all splits (no transfers execute). Order is marked `underpayment`. The shortfall is calculated and stored. **There is currently no automated resolution path** — no refund is issued, no follow-up notification is sent to the buyer, and the merchant has no in-dashboard action to resolve it.

The correct behaviour for underpayments is: issue a full refund of what *was* received back to the sender (returning their money because the order can't be fulfilled at the partial amount), and mark the order as `refunded` or `cancelled`. The merchant then re-creates the order if appropriate. This is the standard pattern for underpayment in payment infrastructure — holding a partial payment indefinitely with no resolution path is worse than returning it.

**Unmatched payment**
A payment arrived for a virtual account that maps to no known order. The system quarantines it (records the webhook event, returns 200 to Nomba, but takes no money action). A finance alert is implied but not implemented — no notification fires. The merchant cannot currently see unmatched payments in the dashboard at all; they only exist in the `webhook_events` table.

### What needs to change

1. **Underpayment** → add `POST /exceptions/:order_ref/refund-shortfall` endpoint that transfers the received amount back to the sender, marks the order `refunded`. Wire a "Refund to Buyer" button in the Exceptions page.
2. **Overpayment** → wire the existing "Refund Excess" button in the frontend to the already-working `POST /exceptions/:order_ref/refund-excess` endpoint.
3. **Unmatched** → surface unmatched payments in the Exceptions queue (they currently exist in `webhook_events` but are invisible in the UI).
4. Both refund actions need a confirmation modal before firing — refunds are irreversible.

---

## Phase A — Docs Rebuild (Merchant-Facing, Markdown-Driven)

**Goal:** Replace the hardcoded `DocsPage.tsx` React component with a real documentation site. Docs should be written in Markdown, cover only what a merchant/marketplace developer needs to know, and be navigable with a sidebar. No mention of Nomba, `vact_transfer`, `aliasAccountReference`, HMAC field construction, or any internal vendor detail.

### What merchants actually need from the docs

1. **Quickstart** — sign up, get API key, create your first order, see the NUBAN, go
2. **Authentication** — how to send the `x-api-key` header; what happens on 401
3. **Orders API** — create an order, list orders, get reconciliation status for one order
4. **Webhooks (outbound)** — the `payment.classified` event we send *to them*; how to verify our signature; the payload shape; retry behaviour
5. **Exceptions & Refunds** — what each status means in business terms; how to list exceptions; how to trigger a refund
6. **Amounts & Units** — kobo convention, why it exists, how to convert
7. **Error codes** — the machine-readable codes they'll see in 4xx responses and what to do about each

### What to explicitly exclude from docs

- Anything about Nomba, sandbox.nomba.com, or Nomba virtual accounts
- The internal webhook signature algorithm we use *inbound* from Nomba
- `aliasAccountReference`, `vact_transfer`, `transactionId` field names
- Any mention of the Nomba sandbox test bank or sandbox credentials
- Internal implementation details (Prisma, Supabase, Railway)

### Implementation

**Option A — MDX files served by the React app** (recommended): Create `apps/web/src/docs/` with one `.md` file per section. A `DocsPage.tsx` uses a lightweight Markdown renderer (e.g. `react-markdown` + `rehype-highlight`) to render the file matching the current sidebar selection. Sidebar nav is driven by a `docs-nav.ts` manifest that lists section IDs and titles. Adding a new doc page is just adding a `.md` file and a manifest entry.

**Option B — Static site generator** (Docusaurus, Nextra): A separate `apps/docs/` workspace. Cleanest long-term but adds build complexity. Appropriate if docs need search, versioning, or their own domain.

Use Option A for this cycle — it keeps the monorepo flat and avoids a new deployment target.

### File layout

```
apps/web/src/docs/
  01-quickstart.md
  02-authentication.md
  03-orders.md
  04-webhooks.md
  05-exceptions.md
  06-amounts.md
  07-errors.md

apps/web/src/pages/DocsPage.tsx   ← rewritten to be a Markdown renderer, not hardcoded content
apps/web/src/lib/docsNav.ts       ← manifest: section id → file path → display label
```

### Deps to add

```
apps/web: react-markdown, rehype-highlight, remark-gfm
```

✅ **Checkpoint:** Every docs section renders from a `.md` file. Clicking a sidebar link loads the correct file. Code blocks have syntax highlighting. Zero mentions of Nomba, vact_transfer, or internal vendor fields anywhere in the rendered docs. A merchant who has never seen the codebase can follow the Quickstart section from zero to a created order using only what's written there.

---

## Phase B — Typography & Spacing Reduction

**Goal:** Reduce font sizes and spatial overscaling across the landing page, login, signup, and dashboard. The current scale reads "presentation slide" — the target is "product you pay for."

### Diagnosis of current overscaling

| Element | Current | Target |
|---|---|---|
| Landing hero `h1` | `text-5xl` / `text-7xl` | `text-4xl` / `text-5xl` |
| Landing section headings | `text-4xl` | `text-2xl` / `text-3xl` |
| Landing body paragraphs | `text-xl` / `text-lg` | `text-base` / `text-lg` |
| Login/signup page `h1` | `text-2xl sm:text-3xl` | `text-xl sm:text-2xl` |
| Login/signup body copy | `text-sm` (fine) | keep |
| Dashboard stat card values | `text-3xl` / `text-4xl` | `text-2xl` / `text-3xl` |
| Dashboard table text | `text-sm` (fine) | keep |
| Dashboard section headings | `text-2xl` | `text-xl` |
| Onboarding left-panel `h2` | `text-3xl xl:text-4xl` | `text-2xl xl:text-3xl` |

### Rules for the pass

- No `text-5xl` or larger anywhere outside the absolute hero tagline (one element, one page)
- Body copy caps at `text-base` (`1rem / 16px`) — `text-xl` for body paragraphs is editorial scale, not product scale
- Section headings: `text-xl` to `text-2xl` maximum
- Tighten `py-` values on hero sections: `py-32` → `py-20`, `py-24` → `py-16`
- Line-height on large headings: ensure `leading-tight` or `leading-snug`, not the default `leading-normal` which adds air at display sizes

### Files touched

- `apps/web/src/pages/LandingPage.tsx` — hero, stats section, features section, how-it-works section
- `apps/web/src/pages/LoginPage.tsx` — heading, subheading
- `apps/web/src/pages/OnboardingPage.tsx` — left panel heading, form heading
- `apps/web/src/pages/OverviewPage.tsx` — stat card values, page heading
- `apps/web/src/pages/OrdersPage.tsx` — page heading
- `apps/web/src/pages/ExceptionsPage.tsx` — page heading

✅ **Checkpoint:** The landing page hero heading is no longer the visual equivalent of a billboard. Auth pages feel compact and professional. Dashboard stat values are readable without being distracting. No horizontal scroll or layout break introduced at any of the four breakpoints (375px, 768px, 1024px, 1440px).

---


## Phase C — Login & Signup Redesign (Minimal Modern SaaS)

**Goal:** Redesign `/login` and `/signup` to feel like a product a fintech merchant would trust. Current design is close but oversized and overly decorated. Target: Linear, Vercel, Stripe-level minimalism.

### Design principles for this pass

- **Less chrome, more content.** Remove decorative blobs, gradients, and glow effects that aren't load-bearing.
- **Single-column centred layout** for login. Signup keeps the two-column split but the left panel becomes leaner.
- **Tight vertical rhythm.** Form fields spaced at `gap-4` not `gap-5` or `gap-6`. Card padding `p-6` not `p-8`.
- **Smaller, sharper logo mark.** The `w-16 h-16` icon on the login page is too large. `w-10 h-10` is the Stripe/Linear scale.
- **Subdued brand colour use.** The green should accent, not dominate. Reduce `bg-[#16A97B]/12` panels; use text-colour brand accents instead.
- **Label typography.** Labels at `text-xs` font-medium uppercase tracking-wide — this is the SaaS pattern (used by Vercel, Railway, Supabase's own dashboard).
- **Button.** Full-width CTA, `py-2.5` height (not `py-3.5` which reads large), `text-sm font-semibold`.
- **Remove the demo key shortcut from LoginPage.** It weakens the product feel. The seed key is for development; it shouldn't be a first-class UI element on the sign-in screen.

### LoginPage specific changes

Current: `Key` icon `w-8 h-8` in a `w-16 h-16` container, `text-2xl sm:text-3xl` heading, `py-3.5` button.

Target:
```
┌─────────────────────────────┐
│  ₦ NairaRails               │  (top-left, small)
│                             │
│     Welcome back            │  text-lg font-semibold
│     Sign in to your account │  text-xs text-muted
│                             │
│  API KEY                    │  text-xs uppercase tracking-wide label
│  [nrk_live_…          👁 ]  │  input, standard height
│                             │
│  [   Access Dashboard →  ]  │  full-width, py-2.5
│                             │
│  Don't have an account? Sign up │  text-xs, muted
└─────────────────────────────┘
```

### OnboardingPage specific changes

Left panel: Remove the hackathon badge (`Nomba × DevCareer Hackathon 2026`). This is now a product, not a hackathon entry. Reduce left-panel heading from `text-3xl xl:text-4xl` to `text-2xl`. Tighten feature bullets spacing.

Right panel: Form heading from `text-2xl sm:text-3xl` to `text-lg sm:text-xl`. Card padding `p-6`. Button height `py-2.5`.

Stat strip at the bottom of the left panel: keep — the `₦35.56B` figure is a strong credibility signal. Just reduce the card padding.

### Files touched

- `apps/web/src/pages/LoginPage.tsx` — full rewrite of layout proportions
- `apps/web/src/pages/OnboardingPage.tsx` — left panel and form proportions

✅ **Checkpoint:** Login page card fits comfortably on a 768px viewport without scrolling. Signup left panel doesn't feel like a marketing brochure. Both pages pass a side-by-side screenshot comparison against Vercel's `/login` for visual weight parity. No functionality removed — API calls, key storage, error states, and routing all unchanged.

---

## Phase D — Reconciliation Actions: Wire the Frontend, Add Underpayment Refund

**Goal:** Make the Exceptions page actually useful. Every exception should have a resolution action the merchant can take. The backend is mostly ready — this phase is primarily frontend wiring plus one new backend endpoint.

### Current gap (explicit)

| Exception type | Backend endpoint | Frontend button | Button wired? |
|---|---|---|---|
| overpayment | `POST /exceptions/:ref/refund-excess` ✅ exists | "Refund Excess" ✅ exists | ❌ not called |
| underpayment | ❌ no endpoint | ❌ no button | — |
| unmatched | ❌ no endpoint | ❌ not shown in UI | — |

### Backend: new endpoint for underpayment refund

```
POST /api/v1/exceptions/:order_ref/refund-shortfall
```

**Logic:**
1. Load the order. Verify it belongs to the calling merchant. Verify `status === "underpayment"`.
2. Verify `senderAccountNumber` and `senderBankCode` are on record (captured from the original webhook).
3. `refundKobo = receivedAmountKobo` — return the full received amount to the sender.
4. `lookupBankAccount` → `transferToBank` to the sender's account.
5. In a single DB transaction: update order `status` to `"refunded"` (new enum value), append a `refund_issued` ledger entry.
6. Return `{ order_ref, refunded_amount_kobo, status: "resolved", nomba_transfer_ref }`.

**Schema change required:** Add `refunded` to the `OrderStatus` enum in `schema.prisma`. Run `db push` / migration.

```prisma
enum OrderStatus {
  pending
  paid
  underpayment
  overpayment
  unmatched
  expired
  refunded    // ← new: full or partial refund issued, order closed
}
```

Also add `refunded` to the `LedgerEntryType` if needed — the existing `refund_issued` type covers it already.

### Backend: surface unmatched payments

Unmatched payments currently exist only in `webhook_events` as raw JSON with no linked order. To surface them in the Exceptions queue, the approach is: when a `payment_success` event has no matching order, write a row to a new `unmatched_payments` table (or use a nullable-orderRef column on `webhook_events`). The Exceptions endpoint then unions orders with `status IN (underpayment, overpayment, unmatched)` and unmatched payment events.

Simpler alternative (use it): Add an `unmatchedPayments` query to `GET /exceptions?type=unmatched` that queries `webhook_events` where `processedAt IS NOT NULL` and the `rawPayload` contains a `aliasAccountReference` that doesn't match any order. Parse the amount and sender from the stored `rawPayload` JSON. No schema change needed.

### Frontend: ExceptionsPage changes

1. **Wire the "Refund Excess" button** on overpayment rows to call `POST /exceptions/:order_ref/refund-excess`. On success, invalidate the exceptions query and show a success toast.

2. **Add "Refund to Buyer" button** on underpayment rows calling `POST /exceptions/:order_ref/refund-shortfall`. On success, invalidate + toast.

3. **Show unmatched payments** in the Exceptions page under a third tab/filter. Display: event timestamp, sender name/account (parsed from `rawPayload`), amount received. No action button — unmatched payments can only be investigated manually (no order to refund against). Display a "Contact support" note.

4. **Confirmation modals.** Both refund actions must show a confirmation modal before firing:
   - Overpayment: "Refund ₦X.XX excess to [sender name / account]? This cannot be undone."
   - Underpayment: "Refund ₦X.XX to [sender name / account]? This will close the order."
   Modal has Cancel and Confirm buttons. Confirm triggers the mutation.

5. **Status badge update.** Add `refunded` to the `StatusBadge` component with a neutral grey colour.

### Files touched

**Backend:**
- `apps/api/src/routes/exceptions.ts` — add `POST /exceptions/:order_ref/refund-shortfall`
- `apps/api/prisma/schema.prisma` — add `refunded` to `OrderStatus` enum
- `packages/shared-types/src/reconciliation.ts` — add `refunded` to `OrderStatusEnum`

**Frontend:**
- `apps/web/src/pages/ExceptionsPage.tsx` — wire buttons, add confirmation modals, add unmatched tab
- `apps/web/src/components/StatusBadge.tsx` (or wherever it lives) — add `refunded` state

✅ **Checkpoint:** Create a test overpayment order, trigger an overpayment webhook, click "Refund Excess" in the dashboard — confirmation modal appears, confirm, Nomba transfer fires, order moves to `paid`, the row disappears from the exceptions queue. Repeat for underpayment: "Refund to Buyer" fires, order moves to `refunded`, row disappears. Both actions are guarded by a confirmation modal. An unmatched payment event is visible in the Exceptions page under the "Unmatched" tab.

---


## Phase E — Auth Overhaul: Business Registration → API Key

**Goal:** Replace the current "fill a form, get a key immediately" flow with a proper business registration system. Merchants register a business identity (name, email, password), verify their email, then receive an API key. Keys can be revoked or set to expire.

This is a meaningful scope — it touches auth on both frontend and backend. It is sequenced last in this cycle because Phases A–D are independent of the auth layer; doing auth first would risk blocking the other work.

### Why the current flow is insufficient

The current flow: `POST /merchants/signup` → key issued in the same 201 response → stored in `localStorage`. Problems:
- No password — anyone with the email can claim it
- No email verification — throwaway addresses work
- No session — the "dashboard login" is just pasting the API key back in
- No revocation — a leaked key is permanent
- No expiry — keys never expire
- `localStorage` is XSS-accessible

### What the new flow looks like

**Registration** (`POST /api/v1/auth/register`):
```
name + email + password + businessType (optional) + webhookUrl (optional)
→ creates Merchant row (emailVerified: false, no key yet)
→ sends verification email via Supabase Auth
→ responds 201: { merchantId, message: "Check your email to verify your account." }
  (no API key in this response)
```

**Email verification**: Merchant clicks link in email → redirected to `/verify?token=…` → frontend calls Supabase `verifyOtp` → on success, calls `POST /api/v1/merchants/keys/issue` (JWT-authenticated) → key is generated, hashed, stored, returned **once**.

**Login** (`POST /api/v1/auth/login`):
```
email + password → Supabase signInWithPassword → returns session JWT
Dashboard uses this JWT (not the API key) for all browser-session routes
```

**API key** is still the credential for `POST /orders`, `GET /exceptions`, etc. — server-to-server calls. The JWT is only for the dashboard browser session.

### Key management endpoints

```
POST /api/v1/merchants/keys/issue      # JWT-auth — issue first key after verification
POST /api/v1/merchants/keys/rotate     # JWT-auth — invalidate old key, issue new one
POST /api/v1/merchants/keys/revoke     # JWT-auth — invalidate key permanently (no replacement)
GET  /api/v1/merchants/keys            # JWT-auth — returns { prefix, issuedAt, expiresAt }
```

Key expiry: on `issue` and `rotate`, accept an optional `expiresAt` (ISO datetime). Default: no expiry (null). The `apiKeyAuth` middleware checks `expiresAt IS NULL OR expiresAt > NOW()` before accepting the key.

### Key hashing (replaces plaintext storage)

```typescript
// issuance
const raw    = "nrk_live_" + crypto.randomBytes(32).toString("hex");
const hash   = crypto.createHash("sha256").update(raw).digest("hex");
const prefix = raw.slice(0, 20); // for display: "nrk_live_3f9a2c1b..."

// lookup in apiKeyAuth middleware
const hash = crypto.createHash("sha256").update(incomingKey).digest("hex");
const merchant = await prisma.merchant.findUnique({ where: { apiKeyHash: hash } });
```

The raw key is returned once at issuance and never stored. The `apiKey` plaintext column on `Merchant` is replaced by `apiKeyHash` and `apiKeyPrefix`.

### Prisma schema changes

```prisma
model Merchant {
  id             String    @id @default(cuid())
  name           String
  email          String    @unique
  webhookUrl     String?   @map("webhook_url")

  // Auth
  supabaseUid    String?   @unique @map("supabase_uid")  // links to Supabase Auth user
  emailVerified  Boolean   @default(false) @map("email_verified")

  // API Key — hashed at rest
  apiKeyHash     String?   @unique @map("api_key_hash")
  apiKeyPrefix   String?   @map("api_key_prefix")         // first 20 chars, for display only
  apiKeyIssuedAt DateTime? @map("api_key_issued_at")
  apiKeyExpiresAt DateTime? @map("api_key_expires_at")   // null = never expires

  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  orders         Order[]

  @@map("merchants")
}
```

Remove the old `apiKey String @unique` column. Migration required — existing keys are invalidated (acceptable; this is a breaking change by design).

### Frontend changes

**New pages/flows:**
- `/register` — business registration form (name, email, password, optional webhook URL). Replaces the current `/signup`.
- `/verify` — "Check your email" holding page with a resend button.
- `/login` — updated to use email + password via Supabase Auth (not API key paste). The current login page is replaced entirely.
- `/dashboard/settings` — new page: shows API key prefix + issuance date, Rotate/Revoke buttons, webhook URL editor.

**Remove:**
- The API-key-paste login flow
- `localStorage.setItem("nairarails_api_key", ...)` from the registration success flow
- The "Use demo key" shortcut on the login page
- `ProtectedRoute` reading from `localStorage` — replace with `supabase.auth.getSession()` check

**Keep:**
- `x-api-key` header on programmatic routes — unchanged for marketplace backend integration
- The API key copy-once display on `/dashboard/settings` after issuance

### `apiFetch.ts` changes

Dashboard routes: attach the Supabase session JWT as `Authorization: Bearer <token>` instead of `x-api-key`.
Programmatic routes: merchants send `x-api-key` from their own server environment — this is unchanged.

### New environment variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # server-side only, never exposed to frontend
```

### Explicitly not doing in this phase

- OAuth providers (Google, GitHub) — email/password is sufficient for v1
- Multiple API keys per merchant
- Per-key scopes (read-only vs read-write)
- Team members / multi-user access
- Password-less magic links

✅ **Checkpoint:** A new merchant can register, receive a verification email, click the link, and have their first API key displayed once in the dashboard. Refreshing the dashboard does not log them out. Rotating the key via `/dashboard/settings` returns a new plaintext key and the old key immediately returns 401 on any API call. Revoking the key causes all subsequent requests with that key to return 401. The seed merchant (`nrk_live_demo_seed_key`) remains functional for development purposes via a direct DB insert — it bypasses the new signup flow but is never shown in the UI.

---

## Suggested Pacing

| Sprint | Phases | Notes |
|---|---|---|
| 1 (1–2 days) | A — Docs rebuild | Entirely frontend + content. Zero risk to existing functionality. Good warm-up sprint. |
| 2 (1 day) | B + C — Typography + Auth page redesign | Pure UI changes. No API or DB involvement. Can be done in parallel if two engineers available. |
| 3 (2 days) | D — Reconciliation actions | One new backend endpoint (`refund-shortfall`) + frontend wiring. Medium risk — touches the exceptions route and adds a schema enum value. |
| 4 (3–4 days) | E — Auth overhaul | Highest risk sprint. Replaces auth on both frontend and backend. Do this last so it doesn't block the other work. |

Sprint 4 (Phase E) is the highest-risk sprint because it replaces the entire auth layer. Run the ROUTES.md test suite against a staging environment before cutting over production. The demo seed key (`nrk_live_demo_seed_key`) should be manually inserted via `seed.ts` after the migration — it will not survive the `apiKey` → `apiKeyHash` column rename.

---

## Architecture After Cycle Three

```
┌──────────────────────────────────────────────────────────────────┐
│  Landing (/)  →  /register  →  email verification  →  /login    │
│                                                                   │
│  /register:  name + email + password → Supabase Auth user        │
│              + Merchant row (emailVerified: false, no key yet)    │
│  /verify:    Supabase OTP exchange → POST /merchants/keys/issue  │
│              → API key shown once in dashboard                    │
│  /login:     email + password → Supabase session JWT             │
└──────────────────────────────┬───────────────────────────────────┘
                               │
           ┌───────────────────┴──────────────────────┐
           │ Dashboard (/dashboard/*)                  │
           │ JWT-authenticated (Supabase session)       │
           │                                           │
           │  Overview · Orders · Exceptions · Settings│
           │  Settings: key prefix, rotate, revoke     │
           │  Exceptions: refund buttons wired + modals│
           └───────────────────────────────────────────┘
                               │ REST API
┌──────────────────────────────▼───────────────────────────────────┐
│  NairaRails API (Express)                                        │
│                                                                   │
│  POST /auth/register          (public)                           │
│  POST /auth/login             (public, Supabase)                 │
│  POST /merchants/keys/issue   (JWT-auth, post-verification)      │
│  POST /merchants/keys/rotate  (JWT-auth)                         │
│  POST /merchants/keys/revoke  (JWT-auth)                         │
│  GET  /merchants/keys         (JWT-auth)                         │
│                                                                   │
│  POST /orders                 (apiKeyAuth — hashed lookup)       │
│  GET  /orders                 (apiKeyAuth)                       │
│  GET  /exceptions             (apiKeyAuth)                       │
│  POST /exceptions/:ref/refund-excess     (apiKeyAuth) ← wired   │
│  POST /exceptions/:ref/refund-shortfall  (apiKeyAuth) ← new     │
│  POST /webhooks/nomba         (HMAC-only, public)                │
│  GET  /health                 (public)                           │
└──────────────────────────────────────────────────────────────────┘
```

---

## Docs Content Outline (what goes in each `.md` file)

### `01-quickstart.md`
1. Prerequisites: NairaRails account, API key, HTTPS endpoint for webhooks
2. Step 1: Create an order — `POST /api/v1/orders` with `order_ref`, `customer_name`, `expected_amount_kobo`, `splits`
3. Step 2: Give your buyer the NUBAN from the response — they pay it via bank transfer
4. Step 3: We call your webhook with `payment.classified` — here's the payload shape
5. Step 4: Check order status at any time via `GET /api/v1/orders/:order_ref/reconciliation`
6. Full working example in Node.js (no SDK required — plain `fetch`)

### `02-authentication.md`
- API keys: format (`nrk_live_…`), where to send (`x-api-key` header), rate limits
- How to rotate and revoke from the dashboard
- What 401 means; what 403 means
- Security: store in env vars, never hardcode, never commit

### `03-orders.md`
- Create order: full request/response reference, field definitions, split rules (must sum to 100, each party needs account number + bank code)
- List orders: pagination, filtering by status
- Reconciliation status: full response shape including `audit_trail`, `splits` array, `shortfall_kobo`, `excess_kobo`
- Order statuses: what each one means in business terms (pending / paid / underpayment / overpayment / unmatched / refunded)

### `04-webhooks.md`
- Overview: we POST to your `webhookUrl` when a payment is classified
- The `payment.classified` event payload — every field explained
- How to verify our signature (`nairarails-signature` header, HMAC-SHA256, your webhook secret from the dashboard)
- Code sample: verifying the signature in Node.js
- Retry behaviour: we attempt delivery once; no automatic retry (log failures, check dashboard)
- Responding to our webhook: return 2xx within 5 seconds; anything else is treated as a delivery failure (logged, no retry)

### `05-exceptions.md`
- What is an exception? Any order not in `paid` state after a payment event
- Underpayment: buyer paid less than required — use the dashboard "Refund to Buyer" action or call `POST /exceptions/:ref/refund-shortfall` via API
- Overpayment: buyer paid more than required — excess is held; use "Refund Excess" action or call `POST /exceptions/:ref/refund-excess`
- Unmatched: payment arrived but we couldn't link it to an order — visible in the dashboard, requires manual investigation
- List exceptions endpoint: filtering by type, response shape

### `06-amounts.md`
- All amounts are in **kobo** (₦1.00 = 100 kobo) — integer only, no decimal naira
- Why: avoids floating-point rounding errors in split math
- How to convert: `naira × 100 = kobo`, `kobo / 100 = naira`
- Example: ₦5,000.00 → `500000`

### `07-errors.md`
- Error response shape: `{ error: { code: string, message: string } }`
- Full table of error codes, their HTTP status, and what they mean
- Common causes and fixes for each

---

## Explicitly Out of Scope (Cycle Three)

- Supabase Auth OAuth providers (Google, GitHub) — email/password is the v1 credential
- Multiple API keys per merchant — one active key per merchant account
- Per-key read/write scopes
- Team members / multi-user merchant accounts
- A retry queue for failed outbound webhook deliveries
- Scheduled nightly reconciliation job (the reconciliation check endpoint exists and is callable; no cron)
- Full documentation search (react-markdown renders content; no Algolia/DocSearch integration)
- A separate `apps/docs` Docusaurus workspace — Option A (MDX in the React app) is used for simplicity

---

*NairaRails — programmable payment infrastructure for Nigeria's next growth wave.*
