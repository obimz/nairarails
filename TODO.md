 1. Open landing page — pitch the problem
  2. Sign up as a merchant → get API key
  3. Open Thunder Client (or Postman) — call POST /api/v1/orders with the
  API key → get a NUBAN back. This simulates what the marketplace backend
  would do when a customer checks out.
  4. Go to Nomba sandbox → send a transfer to that NUBAN. This simulates
  the buyer paying.
  5. Watch the webhook fire → our dashboard updates automatically
  6. Show splits executed, show overpayment/refund in exceptions queue

  Thunder Client / Postman is the stand-in for "the marketplace backend."
  That's not a weakness — judges building infrastructure products
  understand that the API call IS the integration point.

  nrk_live_cmr54jvom0001nzv8shksdfpc

  {
  "order_ref": "ord-test-001",
  "virtual_account_number": "8637609331",
  "bank_name": "Nombank MFB",
  "bank_code": "000026",
  "expected_amount_kobo": 10000,
  "currency": "NGN",
  "status": "pending",
  "created_at": "2026-07-03T16:21:26.962Z"
}

nrk_live_f51fc9c1f070790507739f21d4adac54b56e94d9100cb2e9b6b4b8fbc63c8c78