
  Setup

  In Thunder Client, set an Environment called NairaRails with one variable:

  baseUrl = http://localhost:3000

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  Collection: NairaRails API

  1. Health

  GET {{baseUrl}}/health

  No headers, no body. Expected: 200 {"status":"healthy"}

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  2. Create Order — valid

  POST {{baseUrl}}/api/v1/orders

  Headers:

  Content-Type: application/json

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

  Expected: 201 with a real virtual_account_number (not "pending"), status: "pending"

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  3. Create Order — splits don't sum to 100

  POST {{baseUrl}}/api/v1/orders

  Headers:

  Content-Type: application/json

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

  4. Create Order — duplicate order_ref

  POST {{baseUrl}}/api/v1/orders

  Same body as request #2 ("order_ref": "ord-001"). Run after #2 has already succeeded.

  Expected: 409 — DUPLICATE_ORDER_REF

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  5. List Orders

  GET {{baseUrl}}/api/v1/orders

  No body. Expected: 200 with ord-001 in results, real NUBAN, status: "pending".

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  6. List Orders — filtered by status

  GET {{baseUrl}}/api/v1/orders?status=pending

  Expected: same as above, only pending orders returned.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  7. Reconciliation Detail — found

  GET {{baseUrl}}/api/v1/orders/ord-001/reconciliation

  Expected: 200, received_amount_kobo: null, splits_executed: false, three split rows all "status":
  "pending", audit trail has one entry va_created.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  8. Reconciliation Detail — not found

  GET {{baseUrl}}/api/v1/orders/does-not-exist/reconciliation

  Expected: 404 — ORDER_NOT_FOUND

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  9. Webhook — bad signature (reject test)

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

  Expected: 401 — INVALID_WEBHOOK_SIGNATURE. This proves signature verification is live and rejecting
  forgeries.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  10. Webhook — wrong shape (ignored gracefully)

  POST {{baseUrl}}/api/v1/webhooks/nomba

  Headers:

  Content-Type: application/json
  nomba-signature: anything
  nomba-timestamp: 2026-07-01T00:00:00Z

  Body (JSON):

  { "garbage": true }

  Expected: 200 — {"status":"ignored","reason":"unrecognised_shape"}. Nomba must not be able to crash
  your handler with a malformed payload.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  11. Exceptions — all

  GET {{baseUrl}}/api/v1/exceptions

  Expected: 200, empty results until a real webhook fires. After a real payment, shows
  underpayments/overpayments.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  12. Exceptions — filtered

  GET {{baseUrl}}/api/v1/exceptions?type=overpayment

  Expected: 200, filtered results.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  13. Refund Excess — no overpayment yet

  POST {{baseUrl}}/api/v1/exceptions/ord-001/refund-excess

  No body needed.

  Expected: 422 — order is not an overpayment (it's still pending). This proves the validation gate
  works before any real Nomba transfer is attempted.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  14. Dashboard Overview

  GET {{baseUrl}}/api/v1/dashboard/overview

  Expected: 200, real counts from the DB (not hardcoded). orders_pending: 1 after creating ord-001.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  After a real webhook fires

  Once you send a real payment to the NUBAN from the Nomba sandbox and the webhook arrives, re-run:

  - #5 List Orders — ord-001 should now show status: "paid" (or underpayment/overpayment)
  - #7 Reconciliation — received_amount_kobo populated, split rows updated, audit trail has
  payment_received + classified entries
  - #11 Exceptions — populated if the payment was off
  - #14 Dashboard — counts updated

  For an overpayment, #13 Refund Excess will now succeed and return a real nomba_transfer_ref.

  ────────────────────────────────────────────────────────────────────────────────────────────────────

  What to look for

  ┌───────────────────────────────┬────────────────────────────────────────────────────┐
  │ Request                       │ Pass condition                                     │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #1 Health                     │ 200 healthy                                        │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #2 Create Order               │ Real NUBAN in response, row in Supabase            │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #3 Bad splits                 │ 422                                                │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #4 Duplicate ref              │ 409                                                │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #5–6 List                     │ ord-001 visible, filterable                        │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #7 Reconciliation             │ Null received, pending splits, va_created in trail │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #8 Not found                  │ 404                                                │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #9 Bad sig                    │ 401 — most important security check                │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #10 Bad shape                 │ 200 ignored — not a crash                          │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #13 Refund on non-overpayment │ 422                                                │
  ├───────────────────────────────┼────────────────────────────────────────────────────┤
  │ #14 Dashboard                 │ Real DB counts                                     │
  └───────────────────────────────┴────────────────────────────────────────────────────┘
