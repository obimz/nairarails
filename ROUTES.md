  Setup

  In Thunder Client, set an Environment called NairaRails with two variables:

  baseUrl = http://localhost:3000
  apiKey  = nrk_live_demo_seed_key

  The seed merchant's key is nrk_live_demo_seed_key — run seed.ts first if the DB is empty:
    npx tsx --env-file=.env apps/api/src/scripts/seed.ts

  All authenticated routes require:   x-api-key: {{apiKey}}
  Public routes (no key needed):      GET /health, POST /merchants/signup, POST /webhooks/nomba

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  Collection: NairaRails API

  ── PUBLIC ROUTES ────────────────────────────────────────────────────────────────────────────────────

  1. Health

  GET {{baseUrl}}/health

  No headers, no body. Expected: 200 {"status":"healthy"}

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  2. Merchant Signup

  POST {{baseUrl}}/api/v1/merchants/signup

  Headers:
  Content-Type: application/json

  Body (JSON):
  {
    "name": "Jumia Foods",
    "email": "dev@jumiafood.ng",
    "webhookUrl": "https://webhook.site/your-url-here"
  }

  Expected: 201 with a prefixed API key (nrk_live_...). Key is shown once — store it immediately.
  Run again with the same email: expected 409 — DUPLICATE_MERCHANT_EMAIL.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  3. Merchant Profile

  GET {{baseUrl}}/api/v1/merchants/me

  Headers:
  x-api-key: {{apiKey}}

  Expected: 200 with merchantId, name, email, webhookUrl, createdAt. apiKey field never returned.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  ── ORDER ROUTES (all require x-api-key) ─────────────────────────────────────────────────────────────

  4. Create Order — valid

  POST {{baseUrl}}/api/v1/orders

  Headers:
  Content-Type: application/json
  x-api-key: {{apiKey}}

  Body (JSON):
  {
    "order_ref": "ord-001",
    "customer_name": "Chisom Traders",
    "expected_amount_kobo": 500000,
    "currency": "NGN",
    "splits": [
      { "party": "seller",   "account_number": "0000000000", "bank_code": "035", "percentage": 85 },
      { "party": "platform", "account_number": "0000000000", "bank_code": "035", "percentage": 10 },
      { "party": "rider",    "account_number": "0000000000", "bank_code": "035", "percentage": 5  }
    ]
  }

  Expected: 201 with a real virtual_account_number (NUBAN), status: "pending"

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  5. Create Order — no API key (auth test)

  POST {{baseUrl}}/api/v1/orders

  Headers:
  Content-Type: application/json
  (no x-api-key header)

  Body: same as #4

  Expected: 401 — MISSING_API_KEY. Proves the auth gate is live.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  6. Create Order — splits don't sum to 100

  POST {{baseUrl}}/api/v1/orders

  Headers:
  Content-Type: application/json
  x-api-key: {{apiKey}}

  Body (JSON):
  {
    "order_ref": "ord-bad-splits",
    "customer_name": "Test",
    "expected_amount_kobo": 500000,
    "currency": "NGN",
    "splits": [
      { "party": "seller", "account_number": "0000000000", "bank_code": "035", "percentage": 80 }
    ]
  }

  Expected: 422 — "splits[].percentage must sum to exactly 100"

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  7. Create Order — duplicate order_ref

  POST {{baseUrl}}/api/v1/orders

  Headers:
  Content-Type: application/json
  x-api-key: {{apiKey}}

  Same body as #4 ("order_ref": "ord-001"). Run after #4 has succeeded.

  Expected: 409 — DUPLICATE_ORDER_REF

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  8. List Orders

  GET {{baseUrl}}/api/v1/orders

  Headers:
  x-api-key: {{apiKey}}

  Expected: 200, results scoped to the calling merchant only. ord-001 visible with real NUBAN.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  9. List Orders — filtered by status

  GET {{baseUrl}}/api/v1/orders?status=pending

  Headers:
  x-api-key: {{apiKey}}

  Expected: only pending orders for this merchant returned.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  10. Reconciliation Detail — found

  GET {{baseUrl}}/api/v1/orders/ord-001/reconciliation

  Headers:
  x-api-key: {{apiKey}}

  Expected: 200, received_amount_kobo: null, splits_executed: false, three split rows all
  "status": "pending", audit trail has one entry va_created.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  11. Reconciliation Detail — not found

  GET {{baseUrl}}/api/v1/orders/does-not-exist/reconciliation

  Headers:
  x-api-key: {{apiKey}}

  Expected: 404 — ORDER_NOT_FOUND

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  ── WEBHOOK ROUTES (public — authenticated by Nomba HMAC signature) ──────────────────────────────────

  12. Webhook — bad signature (reject test)

  POST {{baseUrl}}/api/v1/webhooks/nomba

  Headers:
  Content-Type: application/json
  nomba-signature: thisisafakesignature
  nomba-timestamp: 2026-07-01T00:00:00Z

  Body (JSON):
  {
    "requestId": "req-sig-test-001",
    "event_type": "payment_success",
    "data": {
      "transaction": {
        "transactionId": "txn-001",
        "type": "vact_transfer",
        "transactionAmount": 500000,
        "time": "2026-07-01T00:00:00Z",
        "aliasAccountReference": "ord-001"
      },
      "merchant": { "userId": "u1", "walletId": "w1" },
      "customer": { "senderName": "Emeka", "accountNumber": "0000000000", "bankCode": "035" }
    }
  }

  Expected: 401 — INVALID_WEBHOOK_SIGNATURE

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  13. Webhook — wrong shape (ignored gracefully)

  POST {{baseUrl}}/api/v1/webhooks/nomba

  Headers:
  Content-Type: application/json
  nomba-signature: anything
  nomba-timestamp: 2026-07-01T00:00:00Z

  Body (JSON): { "garbage": true }

  Expected: 200 — {"status":"ignored","reason":"unrecognised_shape"}

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  ── EXCEPTIONS ROUTES (all require x-api-key) ────────────────────────────────────────────────────────

  14. Exceptions — all

  GET {{baseUrl}}/api/v1/exceptions

  Headers:
  x-api-key: {{apiKey}}

  Expected: 200, results scoped to calling merchant. Empty until a real webhook fires.
  After seed.ts: shows DEMO-001 (underpayment), DEMO-002 (overpayment), DEMO-005 (unmatched).

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  15. Exceptions — filtered

  GET {{baseUrl}}/api/v1/exceptions?type=overpayment

  Headers:
  x-api-key: {{apiKey}}

  Expected: 200, overpayment orders only for this merchant.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  16. Refund Excess — validation gate (no overpayment yet)

  POST {{baseUrl}}/api/v1/exceptions/ord-001/refund-excess

  Headers:
  x-api-key: {{apiKey}}

  No body needed.

  Expected: 422 — order is not an overpayment (it's still pending). Proves the validation gate
  fires before any Nomba transfer is attempted.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  17. Refund Excess — live (after a real overpayment webhook)

  POST {{baseUrl}}/api/v1/exceptions/DEMO-002/refund-excess

  Headers:
  x-api-key: {{apiKey}}

  No body needed.

  Expected: 200 with nomba_transfer_ref, order status updated to "paid".
  (DEMO-002 from seed.ts is a pre-seeded overpayment with sender details captured.)

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  ── DASHBOARD ROUTES (all require x-api-key) ─────────────────────────────────────────────────────────

  18. Dashboard Overview

  GET {{baseUrl}}/api/v1/dashboard/overview

  Headers:
  x-api-key: {{apiKey}}

  Expected: 200, real counts from the DB scoped to calling merchant.
  After seed.ts: orders_paid: 1, orders_pending: 1, orders_underpayment: 1,
  orders_overpayment: 1, exceptions_open: 3.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  After a real webhook fires

  Once you send a real payment to the NUBAN from the Nomba sandbox and the webhook arrives, re-run:

  - #8  List Orders — ord-001 should now show status: "paid" (or underpayment/overpayment)
  - #10 Reconciliation — received_amount_kobo populated, split rows updated, audit trail has
       payment_received entries
  - #14 Exceptions — populated if the payment was off
  - #18 Dashboard — counts updated

  For an overpayment, #17 Refund Excess will succeed and return a real nomba_transfer_ref.

  To generate a valid webhook signature for manual testing, run:
    node --env-file=.env gen-sig.mjs

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  What to look for

  ┌───────────────────────────────────┬──────────────────────────────────────────────────────┐
  │ Request                           │ Pass condition                                       │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #1  Health                        │ 200 healthy                                          │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #2  Merchant Signup               │ 201 with nrk_live_... key; 409 on duplicate email    │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #3  Merchant Me                   │ 200 profile, no apiKey field in response             │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #4  Create Order                  │ 201, real NUBAN, row in Supabase                     │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #5  Create Order — no key         │ 401 MISSING_API_KEY                                  │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #6  Bad splits                    │ 422                                                  │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #7  Duplicate ref                 │ 409                                                  │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #8–9  List / filter               │ ord-001 visible, scoped to merchant, filterable       │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #10 Reconciliation                │ Null received, pending splits, va_created in trail   │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #11 Not found                     │ 404                                                  │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #12 Bad sig                       │ 401 — most important security check                  │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #13 Bad shape                     │ 200 ignored — not a crash                            │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #16 Refund on non-overpayment     │ 422                                                  │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────┤
  │ #18 Dashboard                     │ Real DB counts scoped to merchant                    │
  └───────────────────────────────────┴──────────────────────────────────────────────────────┘
