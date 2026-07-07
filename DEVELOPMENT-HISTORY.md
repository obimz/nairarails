# NairaRails — Development History

A condensed record of what was built across three development cycles.

---

## Cycle 1 — Core Infrastructure

Built the foundational payment engine from scratch.

**Shared packages**
- `packages/shared-types` — Zod schemas for all API shapes (orders, splits, reconciliation, webhooks, errors)
- `packages/webhook-core` — pure, unit-testable logic: `classify()`, `calculateSplits()`, `verifyNombaWebhook()`; 5 payment states covered in isolation tests

**Backend (Express + Prisma + Supabase)**
- Prisma schema: `orders`, `splits`, `ledger_entries`, `webhook_events`
- `POST /api/v1/orders` — creates order + Nomba virtual account via sub-account route (webhook delivery requires sub-account)
- `POST /api/v1/webhooks/nomba` — HMAC-SHA256 verification, idempotency via DB unique constraint on `requestId`, classifies payment, executes splits
- `GET /api/v1/orders/:ref/reconciliation` — full audit trail per order
- `GET /api/v1/exceptions` — overpayment / underpayment / unmatched queue
- `POST /api/v1/exceptions/:ref/refund-excess` — transfers excess back to sender via Nomba v2
- `POST /api/v1/exceptions/:ref/refund-shortfall` — refunds received amount back to sender
- `GET /api/v1/admin/reconcile-check` — diffs Nomba `/transactions` against local ledger

**Key fixes during this cycle**
- Nomba Transfers API is v2, not v1 — all transfer calls moved to `V2_BASE_URL`
- Nomba expects amounts in naira, not kobo — `transferToBank` divides by 100 before sending
- Split status set conditionally on Nomba's response status (`PENDING_BILLING` → `pending`, not `executed`)

---

## Cycle 2 — Auth, Security, Observability

Transformed working demo into a believable product.

**Merchant auth**
- Supabase Auth for email/password registration and JWT sessions
- `POST /api/v1/auth/register` — creates Supabase user + Merchant row, sends verification email
- `POST /api/v1/auth/login` — Supabase session, returns JWT
- `authAny` middleware — accepts `x-api-key` or `Authorization: Bearer <jwt>` on all merchant routes
- `apiKeyAuth` — SHA-256 hashed keys, never stored in plaintext; shown once on issue

**API key management**
- `POST /api/v1/merchants/keys/issue` — issues `nrk_live_*` prefixed key, stores hash
- `POST /api/v1/merchants/keys/rotate` — invalidates old key, issues new one
- `POST /api/v1/merchants/keys/revoke` — hard revoke

**Outbound webhook signing**
- Every `payment.classified` event signed with `HMAC-SHA256(webhookSecret, body)`
- `nairarails-signature` + `nairarails-timestamp` headers on every outbound event
- `POST /api/v1/merchants/webhook-secret/rotate` — merchant can rotate their webhook secret

**Rate limiting** (three-tier)
- Auth routes: 10 req / 15 min per IP
- API routes: 100 req / min per key
- Global catch-all: 200 req / min per IP
- Redis-backed in production (`REDIS_URL`), in-memory fallback in dev

**CI/CD**
- `.github/workflows/ci.yml` — test → build on every PR; deploy to Railway + Vercel on main push

---

## Cycle 3 — Merchant Experience & UX

Made the product usable end-to-end.

**Landing page** (`/`)
- Three.js + GSAP network animation with bank nodes and payment pulses
- Degrades gracefully on `prefers-reduced-motion` and viewports under 768px

**Merchant onboarding** (`/signup`) and login (`/login`)
- Self-serve registration; API key shown once with copy-to-clipboard
- Supabase email verification gate before key issuance

**Protected dashboard**
- `ProtectedRoute` redirects to `/login` without valid session
- Overview: stat tiles, collection rate bar, revenue area chart, order status bar chart
- Orders: full table with status filters, date range filter, per-order reconciliation drawer
- Exceptions: tabbed queue (overpayment / underpayment / unmatched) with one-click refund actions and confirmation modals
- Settings: name/webhook URL editing, API key issue/rotate/revoke, webhook payload reference

**Admin panel** (`/admin`)
- Gated by `x-admin-secret` header
- Sections: Overview, Merchants, Orders, Reconcile, Webhooks, Health, Tools, Danger
- Mobile-responsive: hamburger + slide-in drawer on small screens
- Reconciliation section calls shared `runReconciliation()` — same codepath as nightly cron

**Nightly reconciliation cron**
- `node-cron` inside the API process, fires at 01:00 UTC
- Diffs Nomba `/transactions` against local `ledger_entries`
- Surfaces orphans (missed webhooks) and amount drift in logs
- `runReconciliation(dateFrom, dateTo)` exported for on-demand use via admin endpoint

**AI support chat**
- Floating chat widget on all dashboard pages
- Gemini 2.5 Flash with NairaRails knowledge base (`apps/api/src/lib/support-context.ts`)
- Keyword-based auto-escalation before hitting the AI (fraud, missing money, legal, etc.)
- Gemini escalation signal: `{ "escalate": true, "reason": "..." }` in response
- Escalated tickets stored in `support_tickets` table, visible in chat Tickets tab and Overview widget
- Admin can view all tickets and mark resolved via `GET/PATCH /api/v1/admin/support-tickets`

**Responsiveness**
- All pages audited; mobile padding fixed across Overview, Orders, Exceptions, Settings
- Admin panel: no mobile nav previously — added hamburger + slide-in drawer
- Dashboard sidebar: ThemeToggle replaced with animated sliding pill (Light ↔ Dark)

---

## Architecture Decisions

| Decision | Reason |
|---|---|
| Virtual accounts via sub-account route | Nomba only fires webhooks for VAs created via `/accounts/virtual/{subAccountId}` |
| Splits on expected amount, not received | Overpayments should not over-pay sellers — excess quarantined separately |
| `node-cron` inside API process | Free, no extra Railway service, negligible compute |
| `authAny` on all merchant routes | Supports both API key (integrations) and JWT (dashboard) with one middleware |
| Gemini system prompt as TypeScript file | Versioned with the codebase, typed, easy to update |
| Escalation before AI for sensitive keywords | Wrong answer about missing money is worse than no answer |
