# NairaRails — Second-Cycle Sprint Plan (Production)

> Companion to `first-cycle-sprint.md`, `README.md`, `ROUTES.md`, and `DEPLOY.md`. The first cycle built the reconciliation engine, the webhook handler, the split-settlement logic, and the operator dashboard. It proved the core product works end-to-end.
>
> This cycle makes NairaRails production-ready. That means real auth (not localStorage), proper security hardening, rate limiting, email verification, per-merchant webhook signing, API key management, observability, and a deployment pipeline that can actually serve live traffic.
>
> Same discipline as cycle one: each phase ends with a hard checkpoint. Don't start the next phase until the current checkpoint passes. Every phase note is explicit about what's being deliberately skipped and why.

---

## What Cycle One Delivered (Current State)

- **Monorepo scaffold** — pnpm workspaces, Turborepo, shared tsconfig (Phase 0 ✅)
- **Shared types** — Zod schemas for orders, splits, reconciliation, webhook shapes, errors (Phase 1 ✅)
- **Pure reconciliation logic** — `classify()`, `calculateSplits()`, `verifyNombaWebhook()` with tests (Phase 2 ✅)
- **Database schema** — `orders`, `splits`, `ledger_entries`, `webhook_events`, `merchants` tables via Prisma (Phase 3 ✅)
- **Nomba integration layer** — `nombaClient.ts` with token caching, VA creation, lookup, transfers (Phase 4 ✅)
- **Backend routes** — orders, webhooks, exceptions, dashboard, admin, merchants, health (Phases 5–6 ✅)
- **API key auth** — `apiKeyAuth` middleware, per-merchant data scoping on all routes (Phase 15 ✅)
- **Outbound webhooks** — `notifyMerchant()` fire-and-forget to merchant's registered `webhookUrl` (Phase 17 ✅)
- **Operator dashboard** — React + Vite, TanStack Query, Tailwind, Overview / Orders / Exceptions (Phases 7–9 ✅)
- **Landing page + onboarding** — Three.js hero, `/signup` form, `ProtectedRoute`, `localStorage` API key (Phases 12–16 ✅)

### Known production gaps (what this cycle fixes)

| Gap | Risk |
|---|---|
| API key stored in `localStorage` | XSS-stealable; no session expiry |
| No email verification on signup | Anyone registers with any email |
| No API key rotation or revocation | Leaked key = permanent compromise |
| No per-merchant webhook signing | Merchant can't verify payloads are from us |
| No rate limiting | API is open to abuse / credential stuffing |
| No structured error monitoring | Silent failures in production |
| No CI pipeline | Regressions ship undetected |
| No zero-downtime deployment | Every deploy is a potential outage |
| Seed key `nrk_live_demo_seed_key` in codebase | Demo credential must not reach production DB |
| No API key hashing at rest | DB breach exposes all keys in plaintext |

---

## What This Cycle Builds

| Layer | What it is | Why it matters |
|---|---|---|
| **Proper auth** | Supabase Auth session for dashboard login; API key for programmatic access | localStorage is not acceptable for production |
| **API key hardening** | Hashed storage, rotation endpoint, revocation | Standard for any infrastructure product |
| **Per-merchant webhook signing** | HMAC-SHA256 on outbound payloads | Merchants need to verify payloads are authentic |
| **Rate limiting** | Per-IP and per-API-key request limits | Prevents abuse without infrastructure changes |
| **Email verification** | Confirm email before API key is active | Blocks throwaway signups |
| **Observability** | Structured logging to a real sink, error tracking, uptime monitoring | You can't fix what you can't see |
| **CI/CD pipeline** | GitHub Actions: test → lint → build → deploy | Regressions caught before they ship |
| **Zero-downtime deployment** | Health-checked rolling deploys on Railway/Render | Deploys don't take the product offline |

---


## Phase 12 — Replace localStorage Auth with Supabase Auth Sessions

**Stack:** Supabase Auth, Express, React

The current flow stores the raw API key in `localStorage` and uses it as both the programmatic credential and the dashboard session token. These are two different things that need to be separated.

**Programmatic access (marketplace backend → NairaRails API):** API key in `x-api-key` header. This stays as-is.

**Dashboard access (merchant operator → browser):** Must use a proper session, not a raw credential in localStorage.

### Backend changes

Replace the current `POST /api/v1/merchants/signup` flow with one that creates a Supabase Auth user alongside the merchant row:

```
POST /api/v1/merchants/signup
  → create Supabase Auth user (email + password)
  → on success, create Merchant row linked to auth.uid
  → send email verification via Supabase Auth
  → respond 201 with merchantId only — no API key yet
  → API key is issued separately after email is verified (Phase 13)
```

Add `GET /api/v1/auth/session` — validates the Supabase JWT from the `Authorization: Bearer <token>` header and returns the merchant profile. This is what the dashboard calls on load instead of reading from localStorage.

Add `POST /api/v1/auth/logout` — invalidates the Supabase session.

The `apiKeyAuth` middleware on programmatic routes (`/orders`, `/exceptions`, etc.) stays unchanged — API keys are still the credential for server-to-server calls. The dashboard routes (`/dashboard/*`) switch to JWT auth via Supabase's session token.

### Frontend changes

Replace the `localStorage` + `ProtectedRoute` pattern:

- Install `@supabase/supabase-js` in `apps/web`
- Create `apps/web/src/lib/supabase.ts` — initialise the Supabase client with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Update `OnboardingPage.tsx` — call `supabase.auth.signUp({ email, password })` instead of the custom signup endpoint directly. On success redirect to "check your email" page.
- Create `LoginPage.tsx` at `/login` — `supabase.auth.signInWithPassword({ email, password })`
- Update `ProtectedRoute.tsx` — check `supabase.auth.getSession()` instead of localStorage. Redirect to `/login` if no active session.
- Remove all `localStorage.getItem/setItem("nairarails_api_key")` calls from `apiFetch.ts` for dashboard routes. The Supabase client handles the session cookie automatically.
- `apiFetch.ts` for programmatic routes: still reads `x-api-key` from wherever the developer has stored it (their own server env, not localStorage)

**Explicitly not doing:** OAuth providers (Google, GitHub) — email/password is sufficient for the first production release. Magic links are a nice-to-have for a later cycle.

✅ **Checkpoint:** A new merchant can sign up, receive a verification email, verify, log in, and reach `/dashboard/overview` with a real Supabase session. Refreshing the page does not log them out. Closing the browser and returning restores the session (Supabase handles this). The `x-api-key` programmatic routes are unaffected — existing curl/Thunder Client tests still pass.

---

## Phase 13 — API Key Hardening: Hashing, Rotation, Revocation

**Stack:** Node.js `crypto`, Prisma, Express

### Problem with current state

API keys are stored in plaintext in the `merchants` table. A database breach exposes every key immediately. The industry standard (used by Stripe, GitHub, Nomba) is to store a hashed version and only ever show the plaintext once — at issuance.

### Schema change

```prisma
model Merchant {
  // ... existing fields ...
  apiKeyHash    String   @unique @map("api_key_hash")  // SHA-256 of the key
  apiKeyPrefix  String   @map("api_key_prefix")        // first 12 chars, for display ("nrk_live_abc1...")
  apiKeyIssuedAt DateTime @default(now()) @map("api_key_issued_at")

  // Remove: apiKey String @unique  ← replaced by apiKeyHash + apiKeyPrefix
}
```

### Issuance flow

```
1. Generate: cryptoRandomBytes(32) → hex string
2. Prefix: "nrk_live_" + hex
3. Hash: SHA-256(prefixed key) → store as apiKeyHash
4. Prefix display: first 12 chars → store as apiKeyPrefix (for "nrk_live_abc1..." display in dashboard)
5. Return plaintext key once in the 201 response — never stored, never retrievable
```

### Auth lookup change

The `apiKeyAuth` middleware can no longer do `findUnique({ where: { apiKey: key } })`. Instead:

```typescript
const hash = crypto.createHash("sha256").update(key).digest("hex");
const merchant = await prisma.merchant.findUnique({ where: { apiKeyHash: hash } });
```

### New endpoints

**`POST /api/v1/merchants/keys/rotate`** — authenticated (Supabase session)

Generates a new key, hashes it, updates the row, returns the new plaintext key once. The old key is immediately invalidated. Merchants should rotate keys on any suspected compromise.

**`POST /api/v1/merchants/keys/revoke`** — authenticated (Supabase session)

Sets `apiKeyHash` to a random non-matching value, immediately invalidating all requests using the old key. Used when a key is confirmed compromised.

**`GET /api/v1/merchants/keys`** — authenticated (Supabase session)

Returns `{ prefix: "nrk_live_abc1...", issuedAt: "..." }` — the display info only, never the hash or plaintext key.

**Explicitly not doing:** Multiple API keys per merchant (one active key per merchant is standard for the first release). Key scopes (read-only vs read-write). Key expiry dates. All reasonable v2 features.

✅ **Checkpoint:** A key stored in the DB cannot be reversed to the original plaintext by reading the `apiKeyHash` column. `POST /api/v1/merchants/keys/rotate` returns a new key and the old one immediately returns 401. `POST /api/v1/merchants/keys/revoke` causes all subsequent requests with the old key to return 401.

---

## Phase 14 — Email Verification Gate

**Stack:** Supabase Auth

Supabase Auth sends a verification email on signup by default — but the current flow issues an API key immediately on `POST /merchants/signup`, before the email is verified. A production system must not issue credentials to unverified addresses.

### Changes

- In the signup handler: after creating the Supabase Auth user and the Merchant row, set `emailVerified: false` on the Merchant row. Do not issue an API key yet.
- Add a `POST /api/v1/auth/verify-email` webhook endpoint that Supabase calls on email confirmation (Supabase Auth supports webhook callbacks on user events). On receipt: set `emailVerified: true`, generate and store the hashed API key (Phase 13 flow), email the merchant their API key.
- Any `apiKeyAuth` check also verifies `merchant.emailVerified === true` — unverified merchants get 403 `EMAIL_NOT_VERIFIED`.
- The dashboard shows a "Check your email" banner if the merchant is logged in but `emailVerified` is false.

**Alternatively** (simpler): use Supabase's built-in email confirmation redirect. After the user clicks the link in the email, they're redirected to `/dashboard/verify?token=...`. The frontend exchanges the token via `supabase.auth.verifyOtp()`, then calls `POST /api/v1/merchants/keys/issue` (authenticated) to receive their first API key.

The second approach is simpler and avoids building a webhook receiver. Use it.

**Explicitly not doing:** Phone verification, KYC/BVN — those are regulated product requirements, not infrastructure ones.

✅ **Checkpoint:** A merchant who signs up but does not verify their email cannot use an API key. Clicking the verification link in the email issues the key and shows it once in the dashboard. A second visit to `/dashboard/overview` shows the key prefix only — not the full key.

---


## Phase 15 — Per-Merchant Outbound Webhook Signing

**Stack:** Node.js `crypto`, Express

Currently `notifyMerchant()` POSTs a `payment.classified` payload to the merchant's `webhookUrl` with no signature. The merchant has no way to verify the payload is genuinely from NairaRails and not forged by a third party. This is a security gap — any attacker who knows the merchant's webhook URL can spoof payment notifications.

### Schema change

```prisma
model Merchant {
  // ... existing fields ...
  webhookSecret  String?  @map("webhook_secret")  // generated on signup, stored hashed
}
```

### Issuance

On merchant signup (after email verification), generate a random webhook secret: `cryptoRandomBytes(32).toString("hex")`. Store it on the merchant row. Show it once in the dashboard alongside the API key — same one-time display pattern.

### Signing

In `notifyMerchant.ts`, before each delivery:

```typescript
const signature = crypto
  .createHmac("sha256", merchant.webhookSecret)
  .update(JSON.stringify(payload))
  .digest("hex");

// Attach as header — same pattern Nomba uses with us
headers["nairarails-signature"] = signature;
headers["nairarails-timestamp"] = new Date().toISOString();
```

Document this in the README so merchants know how to verify: `HMAC-SHA256(webhookSecret, JSON.stringify(body))`, compared against `nairarails-signature` header with `timingSafeEqual`.

### Rotation

Add `POST /api/v1/merchants/webhook-secret/rotate` — authenticated (Supabase session). Generates a new secret, shows it once, invalidates the old one. Merchants must update their verification logic after rotation.

**Explicitly not doing:** Multiple webhook endpoints per merchant, per-event filtering, delivery logs UI (the server already logs failures — a UI is a v2 feature).

✅ **Checkpoint:** A delivery to a `webhook.site` URL includes `nairarails-signature` and `nairarails-timestamp` headers. Computing `HMAC-SHA256(secret, body)` locally matches the header value. Rotating the secret causes the old signature to fail verification.

---

## Phase 16 — Rate Limiting

**Stack:** `express-rate-limit`, Redis (Upstash or Railway Redis)

Without rate limiting, the API is open to:
- Credential stuffing against `POST /merchants/signup` (enumerate valid emails)
- Brute force against `POST /auth/login`
- Abuse of authenticated endpoints by a single merchant

### Implementation

Install `express-rate-limit` and `rate-limit-redis` (for a shared store across multiple API instances).

```typescript
// apps/api/src/middleware/rateLimiter.ts

import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";

// Strict limit for auth endpoints — prevents credential stuffing
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  store: new RedisStore({ /* ... */ }),
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts — try again in 15 minutes" } },
});

// Per-API-key limit for authenticated routes
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  keyGenerator: (req) => req.headers["x-api-key"] as string ?? req.ip ?? "unknown",
  store: new RedisStore({ /* ... */ }),
  message: { error: { code: "RATE_LIMITED", message: "Rate limit exceeded" } },
});

// General limit for all other routes
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  store: new RedisStore({ /* ... */ }),
});
```

Apply in `server.ts`:
- `authLimiter` on `POST /merchants/signup` and `POST /auth/login`
- `apiLimiter` on all authenticated routes
- `globalLimiter` on everything else

New environment variable: `REDIS_URL` — add to `.env.example`.

**Explicitly not doing:** Adaptive rate limiting, per-endpoint custom limits beyond the three tiers above, DDoS mitigation (that's Cloudflare's job, not the application's).

✅ **Checkpoint:** Sending 11 requests to `POST /merchants/signup` within 15 minutes returns 429 on the 11th. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`) are present in responses. A second API instance sharing the same Redis store enforces the same limits (test by spinning up two local instances).

---

## Phase 17 — Observability: Structured Logging, Error Tracking, Uptime

**Stack:** Pino (already in use) → Logtail or Axiom, Sentry, Better Uptime

### Structured log shipping

The API already uses Pino for structured logging. In production, logs need to go somewhere queryable — not just stdout.

- Add `pino-logflare` or `@logtail/pino` transport to ship logs to Logtail (free tier sufficient).
- Every log line must include: `requestId`, `merchantId` (where available), `path`, `method`, `statusCode`, `durationMs`.
- Add a request logger middleware that captures these on every inbound request.

New environment variable: `LOGTAIL_SOURCE_TOKEN`.

### Error tracking

Install `@sentry/node` in `apps/api`. Initialise in `server.ts` before any route is mounted. The existing `errorHandler` middleware should call `Sentry.captureException(err)` before responding. This gives you a searchable record of every 5xx that fires in production.

New environment variable: `SENTRY_DSN`.

### Uptime monitoring

Register the `GET /health` endpoint with Better Uptime (free tier) or UptimeRobot. Alert on Slack or email when it returns non-200 or times out. This costs nothing to set up and means you find out about an outage before your merchants do.

**Explicitly not doing:** Distributed tracing (OpenTelemetry), custom dashboards (Grafana), log-based alerting rules — all correct at scale, overkill for the first production release.

✅ **Checkpoint:** A deliberate 500 error (throw in a test route) appears in Sentry within 60 seconds. A structured log line from that request appears in Logtail with `merchantId`, `path`, and `statusCode` fields. Better Uptime shows the `/health` endpoint as monitored with a green status.

---


## Phase 18 — CI/CD Pipeline

**Stack:** GitHub Actions, pnpm, Vitest, ESLint

Every code change must pass tests and lint before it can be deployed. Currently there is no automated gate — a broken commit can reach production in a `git push`.

### Pipeline structure

```yaml
# .github/workflows/ci.yml
# Triggers on: push to main, all pull requests

jobs:
  test:
    - pnpm install --frozen-lockfile
    - pnpm turbo run lint
    - pnpm turbo run build
    - pnpm turbo run test

  deploy-api:
    needs: [test]
    if: github.ref == 'refs/heads/main'
    - Deploy apps/api to Railway (or Render) via their GitHub integration

  deploy-web:
    needs: [test]
    if: github.ref == 'refs/heads/main'
    - Deploy apps/web to Vercel (or Netlify) via their GitHub integration
```

### Branch protection

On GitHub: require the `test` job to pass before any PR can be merged to `main`. Require at least one reviewer. This ensures the CI gate is not bypassable.

### Environment variables in CI

Store all secrets in GitHub Actions secrets (not in the repo). The CI pipeline uses `secrets.DATABASE_URL`, `secrets.NOMBA_CLIENT_SECRET`, etc. Never commit `.env` to the repo — the `.gitignore` already covers this, but confirm with `git log --all -- .env` before the first production deploy.

**Explicitly not doing:** Staging environment (that's a meaningful operational investment — do it when there are multiple engineers). Preview deployments per PR (nice but not necessary for the first release). Container-based deployment (Railway/Render handles this — no Dockerfile needed yet).

✅ **Checkpoint:** A PR with a failing test cannot be merged — the CI check blocks it. A passing PR merged to `main` triggers an automatic deploy to the production API and frontend. The deploy completes without manual SSH or CLI commands.

---

## Phase 19 — Zero-Downtime Deployment & Production Hardening

**Stack:** Railway/Render health checks, Prisma migrations

### Zero-downtime deploys

Railway and Render both support health-check-based rolling deploys — the new instance must pass `GET /health` before traffic is cut over. Confirm this is configured:

- Set the health check path to `/health` in Railway/Render's deploy settings
- Set a startup grace period of 30 seconds (Prisma connection pool needs time to warm up)
- Confirm the old instance continues serving traffic until the new one is healthy

### Database migrations in production

Never run `db:push` against a production database — it can cause data loss on destructive schema changes. Use `prisma migrate deploy` instead, which applies only pending migration files without touching existing data.

Add a migration step to the CI/CD pipeline:

```yaml
deploy-api:
  steps:
    - run: pnpm --filter @nairarails/api db:migrate:deploy
    - run: <deploy command>
```

The migration runs before the new instance starts serving traffic. If it fails, the deploy aborts — the old instance keeps running.

### Final production checklist

- [ ] All secrets in environment variables only — `git grep -r "NOMBA_CLIENT_SECRET\|DATABASE_URL\|nrk_live_demo"` returns zero matches
- [ ] `NODE_ENV=production` is set in the production environment — disables stack traces in error responses
- [ ] CORS `origin` is set to the exact production frontend URL — not `"*"`
- [ ] `Helmet` CSP headers are configured for the actual asset domains (Vercel/Netlify CDN URLs)
- [ ] All Prisma `BigInt` fields serialize correctly in JSON responses (BigInt is not JSON-serializable by default — confirm the serialization layer handles it)
- [ ] The seed merchant key `nrk_live_demo_seed_key` does not exist in the production database — `seed.ts` is a dev/demo tool only
- [ ] `POST /api/v1/merchants/signup` is protected by `authLimiter` (Phase 16) — confirmed by checking rate limit headers in a real response
- [ ] `pnpm turbo run test` passes clean on the production branch
- [ ] Sentry DSN is configured and a test error appears in the Sentry dashboard
- [ ] Uptime monitor is active and alerting is wired to a real notification channel (Slack, email)

✅ **Checkpoint:** Every item above checked off, not assumed. A deploy to production triggers the health check, migrates the database, and goes live without a gap in service. A deliberate bad deploy (bad health check) rolls back automatically without manual intervention.

---

## Phase 20 — Merchant Dashboard: Key Management UI

**Stack:** React, TanStack Query

With proper auth in place (Phase 12) and hashed keys (Phase 13), the dashboard needs a UI for merchants to manage their credentials — they can no longer just copy from `localStorage`.

### Build

A new **Settings** page at `/dashboard/settings`:

- **API Key section** — shows `{ prefix: "nrk_live_abc1..." }` with the issuance date. "Rotate key" button calls `POST /api/v1/merchants/keys/rotate` and shows the new plaintext key once in a copy box. "Revoke key" button with a confirmation modal calls `POST /api/v1/merchants/keys/revoke`.
- **Webhook section** — shows the registered `webhookUrl`, editable inline. "Rotate webhook secret" button calls `POST /api/v1/merchants/webhook-secret/rotate` and shows the new secret once. Instructions for verifying the `nairarails-signature` header, with a code snippet.
- **Account section** — shows name, email, member since. "Change password" links to Supabase Auth's password reset flow.

**Explicitly not doing:** Team members / multi-user access per merchant account, audit log of key usage, per-key rate limit dashboards. These are v2 features once the product has paying customers.

✅ **Checkpoint:** A merchant can rotate their API key through the UI, copy the new key, and confirm the old key returns 401. The webhook secret rotation flow works end-to-end. The settings page is accessible from the dashboard nav.

---

## Suggested Pacing

| Sprint | Phases | Notes |
|---|---|---|
| 1 (3–4 days) | 12, 13, 14 | Auth replacement first — everything else depends on having real sessions. Highest-risk sprint; touch existing auth flows carefully. |
| 2 (2 days) | 15, 16 | Webhook signing and rate limiting are independent of each other — can be parallelised if two engineers are available. |
| 3 (2 days) | 17, 18 | Observability and CI/CD — no new product features, just infrastructure. Can be done by one engineer while another works on Sprint 4. |
| 4 (2–3 days) | 19, 20 | Hardening pass and settings UI. Don't skip the hardening checklist — it's the difference between "production-ready" and "production-adjacent". |

Sprint 1 is the highest-risk sprint because it replaces the auth layer. Every other phase layers on top of existing code. Budget extra time to verify the existing ROUTES.md test suite still passes after the auth swap.

---

## Architecture After Cycle Two

```
┌──────────────────────────────────────────────────────────────────┐
│                      Landing Page (/)                            │
└──────────────────────────────┬───────────────────────────────────┘
                               │ "Get API Access" CTA
┌──────────────────────────────▼───────────────────────────────────┐
│              Merchant Onboarding (/signup, /login)               │
│         Supabase Auth — email/password, verification email       │
│         POST /api/v1/merchants/keys/issue → API key issued once  │
└──────────────────────────────┬───────────────────────────────────┘
                               │ Supabase session cookie (dashboard)
                               │ x-api-key header (programmatic)
┌──────────────────────────────▼───────────────────────────────────┐
│           Operator Dashboard (/dashboard/*)                      │
│   Session-authenticated. API Key Management in /settings.        │
│   Overview · Orders · Exceptions · Settings                      │
└──────────────────────────────┬───────────────────────────────────┘
                               │ REST API
┌──────────────────────────────▼───────────────────────────────────┐
│                   NairaRails API (Express)                        │
│                                                                   │
│  Rate limiting (Redis-backed) on all routes                      │
│  apiKeyAuth (hashed lookup) on programmatic routes               │
│  Supabase JWT auth on dashboard/settings routes                  │
│                                                                   │
│  POST /merchants/signup     (public, rate-limited)               │
│  POST /auth/login           (public, rate-limited)               │
│  POST /orders               (apiKeyAuth)                         │
│  GET  /orders               (apiKeyAuth, merchant-scoped)        │
│  POST /webhooks/nomba       (HMAC-only)                          │
│  GET  /exceptions           (apiKeyAuth, merchant-scoped)        │
│  GET  /dashboard/*          (JWT auth, merchant-scoped)          │
│  POST /merchants/keys/*     (JWT auth)                           │
│  POST /merchants/webhook-secret/rotate  (JWT auth)               │
│                                                                   │
│  notifyMerchant() — HMAC-signed, fire-and-forget                 │
│  Pino → Logtail · Sentry error tracking                          │
└──────────────────────────────┬───────────────────────────────────┘
                               │
          ┌────────────────────┴──────────────────┐
          │                                       │
┌─────────▼──────────┐               ┌────────────▼───────────┐
│  Nomba API         │               │  PostgreSQL (Supabase)  │
│  Virtual Accounts  │               │  merchants · orders     │
│  Transfers         │               │  splits · ledger_entries│
│  Webhooks          │               │  webhook_events         │
└────────────────────┘               └────────────────────────┘
                                               │
                               ┌───────────────▼──────────────┐
                               │  Redis (Upstash)              │
                               │  Rate limit counters          │
                               └──────────────────────────────┘
```

---

## New Environment Variables

```env
# Supabase Auth
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=      # server-side only — never expose to frontend
VITE_SUPABASE_URL=              # public — safe to expose
VITE_SUPABASE_ANON_KEY=         # public — safe to expose

# Rate limiting
REDIS_URL=

# Observability
LOGTAIL_SOURCE_TOKEN=
SENTRY_DSN=
```

---

## Explicitly Out of Scope (Cycle Two)

- OAuth providers (Google, GitHub login) — email/password is sufficient for v1
- Multiple API keys per merchant — one active key per merchant for the first release
- Per-key scopes (read-only vs read-write keys)
- API key expiry dates
- Multi-user access per merchant account (team members, roles)
- Delivery log UI for outbound merchant webhooks
- Per-endpoint rate limit customisation
- Adaptive rate limiting / DDoS protection (Cloudflare handles this)
- Staging environment (meaningful operational investment — do it at the second engineer)
- Container-based deployment (Railway/Render abstracts this away)
- Phone verification / BVN / KYC

---

*NairaRails — programmable payment infrastructure for Nigeria's next growth wave.*
