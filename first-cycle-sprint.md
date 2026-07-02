# NairaRails — Phased Build Plan (5 Days)

> Companion to `01-API-CONTRACT.md`, `02-BACKEND-GUIDE.md`, `03-FRONTEND-GUIDE.md`. Those three define _what_ to build and the exact shapes. This file defines _the order_ to build it in and _why that order_, so nothing gets built on a foundation that doesn't exist yet.
>
> Each phase ends with a checkpoint. Don't start the next phase until the current checkpoint is true — this isn't bureaucracy, it's the difference between debugging one new thing at a time versus debugging five things at once on day 4.
>
> Solid, not enterprise: every phase below includes real security and correctness (signature verification, idempotency, validation) because those are free to do right the first time and expensive to bolt on later. It deliberately excludes things that only matter past hackathon scale: no queues, no multi-tenant auth, no horizontal scaling, no caching layers. That line is intentional — see each phase's "Explicitly not doing" note.

---

## ✅ Confirmed Nomba Sandbox Facts (verified against real API, 2026-07-01)

These override anything in Training.md or earlier assumptions where they conflict.

### Base URL
- Sandbox: `https://sandbox.nomba.com/v1` (confirmed by hackathon admins on Slack — Training.md says `sandbox.api.nomba.com` which is wrong)

### POST /accounts/virtual — real response shape
```json
{
  "code": "00",
  "description": "SUCCESS",
  "message": "SUCCESS",
  "status": true,
  "data": {
    "createdAt": "2026-07-01T03:51:24.905Z",
    "bankAccountNumber": "7480738575",
    "bankAccountName": "Nomba/ChisomTraders",
    "bankName": "Nombank MFB",
    "accountRef": "ord-005",
    "accountHolderId": "f666ef9b-888e-4799-85ce-acb505b28023",
    "accountName": "Nomba Hackathon 2026",
    "currency": "NGN",
    "bvn": "1234567890",
    "expired": false
  }
}
```
- NUBAN field: `data.bankAccountNumber` (not `accountNumber`, not `nuban`)
- Bank name field: `data.bankName` → `"Nombank MFB"`
- Success indicator: `code === "00"` and `status === true`
- `accountName` in the response is the merchant account name, not the customer name — ignore it
- `accountName` in the **request** must contain no special characters (em dashes, etc.) — use plain customer name only

### Authentication
- Endpoint: `POST /auth/token/issue`
- Body: `{ grant_type, client_id, client_secret }` in JSON body
- Header: `accountId` (not in body)
- Response wraps token in `data.access_token`
- Token valid 60 min — cache at module scope, refresh at 55-min mark

### Database (Supabase)
- `DATABASE_URL`: transaction pooler port `6543` with `?pgbouncer=true` — this is what works
- `DIRECT_URL`: session pooler port `5432` — for migrations only, not used by the running server
- Port `5432` may be blocked on some networks — `db push` may require a different network

---


## Phase 0 — Monorepo Scaffold & Environment

**Stack:** pnpm, Turborepo, TypeScript

**Build:**

- `pnpm init`, `pnpm-workspace.yaml` declaring `apps/*` and `packages/*`
- `turbo.json` with `build`, `dev`, `test`, `lint` pipelines
- `packages/tsconfig/base.json` — shared compiler options every other package extends
- `.env.example` at root listing every variable named in the API contract: `NOMBA_BASE_URL`, `NOMBA_CLIENT_ID`, `NOMBA_CLIENT_SECRET`, `NOMBA_ACCOUNT_ID`, `NOMBA_WEBHOOK_SECRET`, `DATABASE_URL`, `VITE_API_BASE`
- Empty `apps/web`, `apps/api`, `packages/shared-types`, `packages/webhook-core` directories with their own `package.json` + `tsconfig.json` stubs (no real code yet — just wiring so Turborepo recognizes them)
- Git repo initialized, `.gitignore` covering `.env`, `node_modules`, `dist`

**Explicitly not doing:** CI/CD pipelines, Docker, multiple environments beyond sandbox/local. One environment, one branch, for now.

✅ **Checkpoint:** `pnpm install` succeeds at root with zero errors. `pnpm turbo run build` runs (even as a no-op) across all four empty packages without Turborepo complaining about missing pipeline config.

---

## Phase 1 — Shared Contract as Code

**Stack:** TypeScript, Zod

**Build:** `packages/shared-types` — every shape from `01-API-CONTRACT.md` Section 2, as Zod schemas with inferred types:

- `order.ts` — `SplitSchema`, `CreateOrderRequestSchema` (with `.refine()` enforcing splits sum to 100), `OrderResponseSchema`, `OrderListItemSchema`
- `reconciliation.ts` — `OrderStatusEnum`, `SplitResultSchema`, `AuditTrailEntrySchema`, `ReconciliationDetailSchema`, `ExceptionSchema`
- `webhook.ts` — the Nomba webhook envelope shape: `event_type` ("payment_success"), `requestId`, and a nested `data` object with `data.merchant` (`userId`, `walletId`, `walletBalance`), `data.transaction` (`transactionId`, `type` — check for `"vact_transfer"`, `transactionAmount`, `time`, `responseCode`, `aliasAccountReference`, etc.), and `data.customer` (`senderName`, `accountNumber`, `bankCode`). Confirmed via Nomba's real developer docs and independently verified by other teams' working code — supersedes the flatter shape implied by earlier training material.
- `errors.ts` — `ApiErrorSchema`, `ErrorCodeEnum`
- `index.ts` re-exporting all of the above as the single import path

This is the most important phase to get right early — every dollar amount in this entire system is typed as `_kobo` suffixed integers from this point forward, with zero exceptions, so a unit mistake is caught by the type system rather than discovered visually on a dashboard.

**Explicitly not doing:** No runtime code that _uses_ these schemas yet — this phase is purely the contract, nothing consumes it until Phase 2 and Phase 5.

✅ **Checkpoint:** `pnpm --filter @nairarails/shared-types build` compiles clean. You can `import { CreateOrderRequestSchema } from "@nairarails/shared-types"` from a scratch file in either `apps/web` or `apps/api` and get full type inference.

---

## Phase 2 — Pure Reconciliation Logic (No Server, No Database Yet)

**Stack:** TypeScript, Vitest

**Build:** `packages/webhook-core` — every piece of logic that the judged "reconciliation logic quality" criterion actually depends on, built and tested in total isolation from Express and Postgres:

- `verifySignature.ts` — `verifyNombaWebhook(payload: ParsedPayload, headers: { signature, timestamp }, secret: string): boolean`. **Real, confirmed algorithm** (not the simpler raw-body-hex scheme from early training material — that version is wrong and was disproven by other teams' working Slack-confirmed code): build `hashingPayload = [event_type, requestId, data.merchant.userId, data.merchant.walletId, data.transaction.transactionId, data.transaction.type, data.transaction.time, data.transaction.responseCode, timestamp].join(":")`, where `timestamp` comes from the `nomba-timestamp` header — then `HMAC-SHA256(secret, hashingPayload)`, **base64** digest (not hex), compared against the `nomba-signature` header with a timing-safe equality check (`crypto.timingSafeEqual` on equal-length buffers, not `===`).
- `reconciler.ts` — `classify(expectedKobo: number, receivedKobo: number): "paid" | "underpayment" | "overpayment"`. Pure function, no side effects.
- `splitCalculator.ts` — `calculateSplits(amountKobo: number, splits: Split[]): { party: string; amountKobo: number }[]`, applying percentages and assigning any rounding remainder to the largest-percentage party so kobo never silently disappears.
- `tests/verifySignature.test.ts` — one known-good signature (accept), one tampered payload or wrong secret (reject). Build the known-good case by computing the real colon-joined-fields + base64 signature yourself against a fixture payload — not by hashing the raw body. Also note: `NOMBA_WEBHOOK_SECRET` is a string **you invent and register with Nomba yourself** (e.g. `NombaHackathon2026`) — it isn't issued back to you, so there's nothing to fetch or wait on here.
- `tests/reconciler.test.ts` — exact match, underpayment, overpayment, plus boundary cases (received = 0, received = expected exactly)
- `tests/splitCalculator.test.ts` — confirm split amounts sum back to the original input exactly, including a case where percentages don't divide evenly (e.g. 85/10/5 of an odd kobo amount)

This phase is, deliberately, the one where you spend the most disciplined effort relative to its visible size — it's small, but it's the part a technical judge will scrutinize hardest if they ask to see code, and it's the part that's catastrophic to get subtly wrong (money math, security check) versus annoying to get wrong (a UI bug).

**Explicitly not doing:** No HTTP server, no database, no Nomba API calls yet. This package doesn't know Express or Postgres exist.

✅ **Checkpoint:** `pnpm --filter @nairarails/webhook-core test` — all green. You should be able to hand a non-technical person the test file names and have them understand what's been proven to work, just from the filenames.

---

## Phase 3 — Database Schema & Connection

**Stack:** Supabase (Postgres), Drizzle ORM (or node-postgres if preferred)

**Build:** `apps/api/src/db/`

- `schema.ts` — four tables: `orders`, `splits`, `ledger_entries`, `webhook_events`, exactly as specified in `02-BACKEND-GUIDE.md` Section 2, Step 1. Foreign keys from `splits` and `ledger_entries` to `orders.order_ref`. A `unique` constraint on `webhook_events.request_id` — this single constraint is your idempotency guarantee at the database level, not just application logic.
- `client.ts` — Drizzle/pg client connected via Supabase's **session pooler** connection string (Express is long-lived, not serverless — using the transaction pooler here is the most common Supabase misconfiguration and worth avoiding explicitly).
- Migration run against Supabase.

**Why this comes before any route:** every route in Phase 5 needs a real table to read/write. Building routes against a schema that doesn't exist yet means mocking the database twice — once now, once for real — which is wasted motion.

**Explicitly not doing:** No read replicas, no connection pooling tuning beyond picking the correct pooler mode, no backup/restore strategy. One Postgres instance, correctly connected, is sufficient.

✅ **Checkpoint:** Migration applied successfully; all four tables visible in the Supabase Table Editor with correct column types (`bigint` for kobo amounts, not `integer` — Postgres `integer` caps around 2.1 billion, which is fine for kobo at hackathon scale but `bigint` costs nothing extra and removes the ceiling as a future concern).

---

## Phase 4 — Nomba Integration Layer

**Stack:** TypeScript, native `fetch`

**Build:** `apps/api/src/integrations/nombaClient.ts` — exactly as scaffolded in `02-BACKEND-GUIDE.md` Section 2, Step 2:

- `getAccessToken()` with in-memory caching, refreshed at the 55-minute mark per the training's explicit guidance
- `createVirtualAccount()`
- `lookupBankAccount()`
- `transferToBank()`

This is the **first point of real contact with Nomba's sandbox.** Do this as its own phase, isolated, because it's the highest-uncertainty part of the whole build — the training doesn't publish every response shape, so this is where you confirm the real `POST /accounts/virtual` response structure against a live sandbox call before any other code depends on it.

**Webhook registration — do this in parallel with the above, as early in the phase as possible:**

Nomba needs your webhook URL registered before it can send anything there, and this step has external lead time you don't control, so start it early rather than waiting until the route is fully built:

- Stand up a minimal `apps/api` with just `POST /api/v1/webhooks/nomba` present — for now it can simply log the raw body and return `200`, full logic comes in Phase 5
- Make it publicly reachable: either deploy it (Railway/Render) even half-finished, or run a tunnel (`ngrok`, `cloudflared`) pointing at your local server
- Submit/register that public URL with Nomba through whatever onboarding process the hackathon specifies — do this immediately, don't wait for the route to be feature-complete, in case registration or propagation takes time on Nomba's side
- If the registered URL changes later (e.g. swapping a tunnel for a real deployment), re-register it — don't assume the old URL silently updates

**Explicitly not doing:** No retry/backoff logic on Nomba calls, no circuit breaker. If a Nomba call fails, the calling route surfaces a clear error — that's enough robustness for an MVP; automatic retry logic is a production concern, not a correctness one.

✅ **Checkpoint:** Two things must both be true, not just the first one. (1) A manual script (`apps/api/src/scripts/test-nomba.ts`, not committed to the demo flow) successfully calls `createVirtualAccount` against the real sandbox and logs back a real NUBAN. (2) Your webhook URL is registered with Nomba and confirmed reachable — send a real test transfer to that NUBAN (training's test bank: Wema Bank, account 0000000000, accepts any inbound transfer) and confirm something actually arrives at your logging stub. This is the single most important checkpoint in the entire 5 days — if either half fails, nothing downstream can be trusted, so don't proceed to Phase 5 until both are true.

---

## Phase 5 — Backend Routes: Orders & Webhooksalright now pl

**Stack:** Express, Zod middleware, the packages from Phases 1–4

**Build, in this exact internal order:**

1. **Middleware first** — `validate.ts` (Zod-validation middleware factory), `errorHandler.ts` (centralized, maps any thrown error to the contract's error shape), `cors.ts` (allow only the deployed frontend origin).
2. **`POST /api/v1/orders`** — validate against `CreateOrderRequestSchema` (Phase 1), insert order + splits inside a single DB transaction (Phase 3), call `createVirtualAccount` (Phase 4), store the returned NUBAN, respond per contract 2.1.
3. **`GET /api/v1/orders`**, **`GET /api/v1/orders/:order_ref/reconciliation`** — straightforward reads.
4. **`POST /api/v1/webhooks/nomba`** — the most carefully built route in the system. Mounted with `express.raw({ type: "application/json" })`, not the global JSON parser, since signature verification needs the parsed `data.merchant`/`data.transaction` fields plus the `nomba-timestamp` header value (Phase 2 takes these as structured inputs, not just raw bytes — parse the JSON first, then feed the specific fields into `verifyNombaWebhook`). Flow: parse body → verify signature (Phase 2) → check `event_type === "payment_success"` **and** `data.transaction.type === "vact_transfer"` (ignore/200 anything else — this is the only event/type combination that matters for VA funding) → check `webhook_events` for existing `requestId` → insert the event row → look up the order by `data.transaction.aliasAccountReference` (maps to your local `order_ref`) → call `classify()` (Phase 2) using `data.transaction.transactionAmount` as the received kobo amount → update order status, storing `data.customer.senderName`/`accountNumber`/`bankCode` for later refunds → call `executeSplits()` (which itself calls `lookupBankAccount` then `transferToBank` from Phase 4, per party) → always respond `200` once the event is safely recorded, regardless of outcome.

This phase is where Phases 1 through 4 all get consumed together for the first time — that's intentional sequencing, not an accident. Each prior phase was built and verified in isolation specifically so that when they're wired together here, you're debugging _integration_, not _logic_ — the logic was already proven correct in Phase 2's tests.

**Explicitly not doing:** No background job queue for webhook processing — handle it synchronously in the request, which is correct at hackathon transaction volume. No webhook replay/dead-letter storage beyond the `webhook_events` table itself.

✅ **Checkpoint:** Webhook reachability was already proven in Phase 4 — this checkpoint is about the _logic_, not the plumbing. Using a tool like Postman or a curl script, create a real order, get back a real sandbox NUBAN, send a real test transfer to that NUBAN (training's test bank: Wema Bank, account 0000000000, accepts any inbound transfer), and watch the webhook get verified, classified, and trigger a real split transfer — fully live, fully automated, zero manual steps in between.

---

## Phase 6 — Backend Routes: Exceptions, Dashboard, Reconciliation Backstop

**Stack:** Express (same app as Phase 5)

**Build:**

- `GET /api/v1/exceptions` and `POST /api/v1/exceptions/:order_ref/refund-excess` — the refund route uses the `sender_account_number`/`sender_bank_code` captured during Phase 5's webhook handler, calling `lookupBankAccount` then `transferToBank` back to the original payer.
- `GET /api/v1/dashboard/overview` — aggregate queries (counts, sums) across the `orders` table.
- `GET /api/v1/admin/reconcile-check` — pulls Nomba's `/transactions` for a date range, diffs against local `ledger_entries`/`orders` by reference, surfaces drift. Doesn't need scheduling — a callable endpoint is sufficient to demonstrate the concept.
- `GET /api/v1/health` — trivial, but named explicitly in Nomba's own checklist as something judges may check directly.

**Why this is its own phase, not folded into Phase 5:** Phase 5 is the core money-moving path and deserves to be verified completely on its own before anything else touches the same tables. These routes are read-heavy/auxiliary by comparison — lower risk, fine to layer on once the core loop is proven solid.

**Explicitly not doing:** No cron scheduler for the reconciliation backstop — described and callable, not automated, which is an honest and stated scope cut rather than a silent gap.

✅ **Checkpoint:** All contract Section 2 endpoints now exist and respond correctly against real data created in Phase 5.

---

## Phase 7 — Frontend Foundation & Mock-Driven Pages

**Stack:** React, Vite, TanStack Query, Tailwind CSS

**Build:** Per `03-FRONTEND-GUIDE.md` Sections 1–2:

- `apiFetch.ts` — the single fetch wrapper, contract-error-aware
- `money.ts` — `koboToNaira`/`formatNaira`, used everywhere an amount touches the screen
- A local mock server matching contract Section 2 shapes exactly, on its own port
- `QueryClientProvider` wired at the app root

**This phase can run in parallel with Phases 3–6**, not after them — that's the entire point of having locked the contract in Phase 1. The frontend doesn't need a real backend to start; it needs the contract, which has existed since Phase 1.

**Explicitly not doing:** No real backend calls yet — everything in this phase targets the mock.

✅ **Checkpoint:** A scratch page can successfully `apiFetch` the mock server and render a formatted naira amount from a kobo value.

---

## Phase 8 — Frontend Pages: Exceptions, Orders, Overview

**Stack:** React, Vite, TanStack Query, Recharts

**Build, in this order (matches judging weight):**

1. **Exceptions page** — grouped by type, color-coded, with a live "Refund Excess" button wired via `useMutation` against `POST /exceptions/:order_ref/refund-excess`.
2. **Orders page** — filterable table, row-click into reconciliation detail with splits breakdown and audit-trail timeline.
3. **Overview page** — stat cards and one Recharts chart, deliberately the lightest-effort page of the three.

Built against the mock from Phase 7 — this phase does not require Phases 3–6 to be finished.

**Explicitly not doing:** No client-side state management library beyond TanStack Query's cache — Redux/Zustand/etc. would be solving a problem this app doesn't have at this size.

✅ **Checkpoint:** All three pages fully functional against mock data, including the refund button mutating mock state.

---

## Phase 9 — Integration: Frontend ⇄ Real Backend

**Stack:** Everything from Phases 1–8, now connected

**Build:** Change `VITE_API_BASE` from the mock port to the deployed (or local) real Express API. This is explicitly the first time the two halves of the team's work touch each other for real.

If Phase 1's contract was followed faithfully by both sides, this is genuinely a small change — an env var swap plus fixing any incidental field-name typos, not a rebuild. If it's not small, that's a signal the contract drifted somewhere, and the fix is to update the contract doc first, then both sides, not to patch around the mismatch locally in one app.

✅ **Checkpoint:** Create a real order from the live dashboard, pay its real sandbox NUBAN, watch the Orders and Exceptions pages update with real classification, and successfully click a real "Refund Excess" button that fires a real Nomba transfer — entirely through the UI, zero manual API calls.

---

## Phase 10 — Hardening Pass Against the Nomba Checklist

**Stack:** No new stack — this phase is verification, not feature-building

**Run through `01-API-CONTRACT.md` Section 4.10 line by line:**

- Secrets confirmed in environment variables only, never committed (grep the repo for the literal secret values as a final check)
- Webhook handler verified to reject a deliberately tampered payload (write or rerun the test from Phase 2 against the live route, not just the isolated function)
- Idempotency confirmed by sending the same webhook payload twice and observing the second is ignored
- Every amount sent to or received from Nomba confirmed in kobo, spot-checked against a real transaction
- `lookupBankAccount` confirmed to run before every `transferToBank` call, no exceptions
- Both underpayment and overpayment branches manually triggered and observed end-to-end
- `/api/v1/health` returns 200
- Structured log lines include `merchantTxRef` on every Nomba call — even basic `console.log` lines are sufficient, the point is traceability, not log infrastructure

**Explicitly not doing:** No load testing, no penetration testing, no SOC2-style audit. This is a correctness pass against a known, finite checklist, not open-ended hardening.

✅ **Checkpoint:** Every item above checked off, not assumed.

---

## Phase 11 — Seed Data & Demo Rehearsal

**Stack:** A small Node script

**Build:** `apps/api/src/scripts/seed.ts` — inserts 4–5 orders directly into the database across different states (pending, paid, underpayment, overpayment, unmatched), so the dashboard has a populated, varied demo dataset even if live webhook timing doesn't cooperate in front of judges. The live sandbox flow remains the main demo; this is the fallback that guarantees the dashboard never looks empty.

**Then, rehearse the actual demo sequence at least twice, live, against the real deployed stack:** create an order → pay it → watch the webhook fire → watch classification happen → watch the split execute → show the dashboard → trigger a refund on an overpayment. Time it. A great build that's never been run end-to-end before the actual presentation is the single biggest risk remaining at this point — not a code risk, a rehearsal risk.

✅ **Checkpoint:** The full demo sequence has been run successfully, live, twice, by the person who will actually present it.

---

## Suggested 5-Day Pacing

| Day | Phases                                                                                              |
| --- | --------------------------------------------------------------------------------------------------- |
| 1   | 0, 1, 2 — scaffold, contract, pure logic (no server, no Nomba contact yet)                          |
| 2   | 3, 4 — database live, first real Nomba sandbox contact confirmed, webhook URL registered with Nomba |

⚠️ **Webhook registration is on the critical path, not a side task.** It has external lead time Nomba controls, not you. Submit your webhook URL the moment you have any publicly reachable endpoint — even a stub that just logs and returns 200 — rather than waiting until Phase 5's full logic is built. If registration is slow or requires approval on Nomba's side, you want that clock running on Day 2, not discovered on Day 4.
| 3 | 5, 6 (backend) **in parallel with** 7, 8 (frontend against mock) |
| 4 | 9 — integration; fix whatever surfaces |
| 5 | 10, 11 — hardening checklist, seed data, rehearsal |

Day 3 is the only day where two people are required to genuinely work in parallel on different halves — every other day either has a natural single-threaded dependency (Phase 4 must exist before Phase 5) or is explicit two-track work that was already designed in Phase 1 to not block on itself.
