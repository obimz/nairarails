Training
/
Your Hackathon Environment
Module 02
3 min read
Your Hackathon Environment
Knowledge checks · 0 / 1
0%
Nomba ships two fully isolated environments. The sandbox mirrors production behaviour — including webhook signatures and settlement timings — but uses test cards and test bank accounts. Never mix credentials.

Environment	Base URL	Use
Sandbox	https://sandbox.api.nomba.com/v1	All hackathon work
Production	https://api.nomba.com/v1	Post-certification, after KYC
Test instruments
Test card (success): 5060 6666 6666 6666 666 — any future expiry, any CVV
Test card (insufficient funds): 5060 6666 6666 6666 674
Test bank: Wema Bank, account 0000000000 will accept any inbound transfer
Never commit secrets
Treat clientSecret like a password. Load it from environment variables, not from source.

Training
/
Setup & Authentication
Module 03
5 min read
Setup & Authentication
Knowledge checks · 0 / 2
0%
Nomba uses OAuth 2.0 client_credentials for server-to-server calls. You exchange your clientId and clientSecret for a short-lived access token (1 hour) and attach it as a Bearer token on every subsequent request, plus the accountId header.

POST
/auth/token/issue
Issue an access token for your account
POST
/auth/token/refresh
Refresh an access token before it expires
Issuing a token
Node.js
Python
Copy
import fetch from "node-fetch";

const res = await fetch("https://api.nomba.com/v1/auth/token/issue", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "accountId": process.env.NOMBA_ACCOUNT_ID!,
  },
  body: JSON.stringify({
    grant_type: "client_credentials",
    client_id: process.env.NOMBA_CLIENT_ID,
    client_secret: process.env.NOMBA_CLIENT_SECRET,
  }),
});

const { data } = await res.json();
console.log("access_token:", data.access_token);
Cache your tokens
Tokens are valid for 60 minutes. Cache in memory or Redis and refresh at the 55-minute mark — do not request a fresh token per call.

Required headers on every authenticated call
Header	Value
Authorization	Bearer <access_token>
accountId	Your Nomba account ID
Content-Type	application/json


Training
/
Sub-accounts
Module 04
3 min read
Sub-accounts
Knowledge checks · 0 / 1
0%
Sub-accounts let you split a single Nomba merchant into many logical accounts — perfect for marketplaces, multi-tenant SaaS, or any product where funds must be tracked per seller, per branch, or per project. Each sub-account has its own balance and its own virtual accounts.

POST
/accounts/sub-accounts
Create a new sub-account
GET
/accounts/sub-accounts
List sub-accounts under your parent
GET
/accounts/sub-accounts/{id}/balance
Fetch the available balance of a sub-account
Node.js
Python
Copy
const sub = await nomba.post("/accounts/sub-accounts", {
  accountName: "Seller — Adaeze Kitchen",
  accountRef: "seller_adaeze_001",
});
Use stable refs
Pass your own accountRef so you can look up Nomba sub-accounts from your database without storing Nomba IDs as primary keys.

Training
/
Online Checkout
Module 05
4 min read
Online Checkout
Knowledge checks · 0 / 2
0%
The Checkout API generates a hosted payment page. You POST the order, get a checkoutUrl back, and redirect the customer. Nomba handles card entry, 3-D Secure, OTPs, and PCI scope. You receive a webhook when payment completes.

POST
/checkout/order
Create a hosted checkout session
GET
/checkout/order/{orderReference}
Look up a checkout session status
Node.js
Python
Copy
const order = await nomba.post("/checkout/order", {
  order: {
    orderReference: "ord_" + crypto.randomUUID(),
    amount: 250000,             // kobo — ₦2,500.00
    currency: "NGN",
    callbackUrl: "https://yourapp.com/payment/return",
    customerId: "cus_8821",
    customerEmail: "ada@example.com",
  },
});
return res.redirect(order.data.checkoutUrl);
Amounts are in kobo
₦1.00 is 100 kobo. Sending 25 will charge 25 kobo, not ₦25. Always multiply by 100.

Try it
POST /checkout/order
Node
Python
Amount (₦)
2500
Currency
NGN
Customer email
ada@example.com
Order reference
ord_demo_001
await nomba.post("/checkout/order", {
  order: {
    orderReference: "ord_demo_001",
    amount: 2500 * 100,   // kobo
    currency: "NGN",
    customerEmail: "ada@example.com",
    callbackUrl: "https://yourapp.com/payment/return",
  },
});
Order the steps
Put a hosted-checkout payment in the right order.
shuffle
1
Customer clicks Pay in your app
2
Your server POSTs /checkout/order and gets a checkoutUrl
3
You redirect the customer to the checkoutUrl
4
Customer enters card and 3-D Secure on Nomba's hosted page
5
Nomba posts payment_success webhook to your server
6
Your server verifies the signature, marks the order paid, and fulfils
Solved
Correct order ✓

Training
/
Tokenized Cards & Recurring Payments
Module 06
5 min read
Tokenized Cards & Recurring Payments
Knowledge checks · 0 / 1
0%
After a successful checkout, Nomba returns a card token representing the customer's card. You can charge that token later — for subscriptions, top-ups, or one-click re-orders — without the customer re-entering details. Tokens are scoped to your merchant and cannot be used elsewhere.

POST
/tokenized-card/charge
Charge a previously saved card token
GET
/tokenized-card/list
List saved tokens for a customer
DELETE
/tokenized-card/{tokenId}
Revoke a stored card token
Node.js
Python
Copy
await nomba.post("/tokenized-card/charge", {
  amount: 500000,                // ₦5,000.00
  currency: "NGN",
  cardId: "tok_5fa12b...",
  customerId: "cus_8821",
  merchantTxRef: "sub_2026_03_" + customerId,
});
Subscriptions are your job
Nomba does not run the schedule — you do. Store the token, run a cron, and charge on your billing cycle. Always send a unique merchantTxRef per attempt to make retries idempotent.

Training
/
Virtual Accounts
Module 07
4 min read
Virtual Accounts
Knowledge checks · 0 / 1
0%
Virtual accounts are dedicated NUBAN accounts you can issue to any customer or invoice. When the customer transfers to that NUBAN from any Nigerian bank, you get a webhook with the amount, sender, and your reference. Perfect for invoicing, escrow, and bank-transfer checkout flows.

POST
/accounts/virtual
Create a permanent or one-time virtual account
GET
/accounts/virtual/{accountId}
Fetch virtual account details and balance
Node.js
Python
Copy
const va = await nomba.post("/accounts/virtual", {
  accountRef: "inv_9921",
  accountName: "Acme Ltd — INV 9921",
  expiryDate: "2026-12-31",
  amount: 1000000,        // ₦10,000.00 — optional, locks expected amount
});
Handle over- and under-payment
Even when you set an expected amount, the bank rails will accept any value. Compare amountReceived to amountExpected in your webhook handler — refund overpayments and surface short-payments to the customer.

Training
/
Webhooks
Module 08
5 min read
Webhooks
Knowledge checks · 1 / 3
33%
Webhooks are how Nomba tells your server that something happened — a payment succeeded, a virtual account was funded, a transfer completed. Every webhook is signed with HMAC-SHA256 using your webhook secret. You must verify the signature before trusting the payload.

Verifying signatures
Node.js
Python
Copy
import crypto from "crypto";

app.post("/webhooks/nomba", express.raw({ type: "application/json" }), (req, res) => {
  const signature = req.header("nomba-signature");
  const expected = crypto
    .createHmac("sha256", process.env.NOMBA_WEBHOOK_SECRET!)
    .update(req.body)
    .digest("hex");

  if (signature !== expected) return res.status(401).send("bad signature");

  const event = JSON.parse(req.body.toString());
  // Idempotency: ignore if we have already processed event.requestId
  res.sendStatus(200);
});
Webhooks may fire twice
Network retries can deliver the same event multiple times. Store event.requestId in a unique index and reject duplicates — never apply a balance change twice.

Common event types
Event type	Fires when
payment_success	A checkout or token charge completes
virtual_account.funded	A NUBAN you issued receives a transfer
transfer.success	An outbound transfer settles to the recipient
transfer.failed	An outbound transfer is reversed
mandate.debit_success	A direct debit attempt clears

Think first
Before reading the answer: name two things that can go wrong if you skip signature verification.
1) An attacker can forge a webhook to your endpoint and trigger fake credits — granting subscription access or shipping goods that were never paid for. 2) Even without malice, you may process garbage payloads from misrouted traffic or staging environments, polluting your ledger.

Signature labWhich of these is the valid nomba-signature for the payload + secret below?
Payload
{"event":"payment_success","requestId":"req_3f9a2c","data":{"merchantTxRef":"ord_8821","amount":250000,"currency":"NGN"}}
Webhook secret
whsec_demo_nomba_2026

58ee13f46d68c62780e11653ce88175c9c39dfc402a9ce857ad2beebb50aece0

0e8c3f1ae377e1c56a237f490eb20955656bd172147170d9b749e29efbbe6bf5

aad53945391b25ff8dc3c11ff2f54cc463cfb926ff8566a72593a158b1be67e5

de7774f67f8b80bd8a3e4752e27748708c21a3c51940da5588e8933e9f79f779
Correct. That's HMAC-SHA256(secret, raw body) hex-encoded — the exact computation your handler must reproduce.

Training
/
Transfers
Module 09
4 min read
Transfers
Knowledge checks · 0 / 1
0%
Transfers move money out of your Nomba balance to any Nigerian bank account. Use them for payouts, refunds beyond the original card window, and treasury operations. Every transfer needs a verified recipient and a unique merchantTxRef.

POST
/transfers/bank/lookup
Resolve an account number to a name before sending
POST
/transfers/bank
Initiate a bank transfer
GET
/transfers/{merchantTxRef}
Check transfer status
Node.js
Python
Copy
const lookup = await nomba.post("/transfers/bank/lookup", {
  bankCode: "044",                  // Access Bank
  accountNumber: "0123456789",
});

await nomba.post("/transfers/bank", {
  amount: 1500000,                  // ₦15,000.00
  bankCode: "044",
  accountNumber: "0123456789",
  accountName: lookup.data.accountName,
  senderName: "Acme Ltd",
  narration: "Payout — March 2026",
  merchantTxRef: "payout_" + crypto.randomUUID(),
});
Always lookup before transfer
Sending to a wrong NUBAN can be irreversible. Display the resolved accountName to the user for confirmation before initiating the transfer.

Training
/
Direct Debits (Mandates)
Module 10
4 min read
Direct Debits (Mandates)
Knowledge checks · 0 / 1
0%
A mandate is the customer's standing authorisation to debit their bank account on a recurring or on-demand basis. Use mandates for lending, BNPL, or any service that needs to pull funds without the customer initiating each charge. Mandates require explicit customer consent via OTP or in-app approval.

POST
/mandates/create
Create a mandate request — returns a consent URL
POST
/mandates/{mandateId}/debit
Debit a previously approved mandate
DELETE
/mandates/{mandateId}
Cancel an active mandate
Node.js
Python
Copy
const mandate = await nomba.post("/mandates/create", {
  customerId: "cus_8821",
  maxAmount: 5000000,              // ₦50,000 ceiling per debit
  frequency: "monthly",
  startDate: "2026-04-01",
  endDate: "2027-04-01",
});
// redirect customer to mandate.data.consentUrl
Respect the ceiling
Attempting to debit more than maxAmount will fail. If your billing exceeds the ceiling, create a new mandate — do not split debits to bypass it.

Training
/
Transactions & Reconciliation
Module 11
4 min read
Transactions & Reconciliation
Knowledge checks · 0 / 1
0%
Reconciliation is the daily discipline of matching what your app thinks happened against what Nomba records. Skipping reconciliation is the single most common reason fintech startups lose money silently. Pull the transactions endpoint nightly, diff against your local ledger, and alert on any drift.

GET
/transactions
List transactions with filters: dateFrom, dateTo, status, type
GET
/transactions/{merchantTxRef}
Look up a single transaction by your reference
Node.js
Python
Copy
const { data } = await nomba.get("/transactions", {
  params: { dateFrom: "2026-03-01", dateTo: "2026-03-31", status: "success" },
});

for (const tx of data.transactions) {
  const local = await db.payments.findOne({ ref: tx.merchantTxRef });
  if (!local) await alertOps("Orphan transaction on Nomba", tx);
  else if (local.amount !== tx.amount) await alertOps("Amount drift", { local, tx });
}
Reconcile by reference, not by ID
Your merchantTxRef is the source of truth. Use it to join Nomba's view with yours — Nomba's internal IDs may rotate during retries.


Training
/
Mapping APIs to Tracks
Module 12
3 min read
Mapping APIs to Tracks
Knowledge checks · 0 / 1
0%
Each hackathon track is judged on how well your integration matches a real-world Nomba use case. Use this table to identify which APIs to focus on for your track — then over-invest in the corresponding modules.

Hackathon track	Primary APIs	Bonus polish
Marketplace / multi-vendor	Sub-accounts, Transfers, Webhooks	Reconciliation dashboard
Subscription product	Checkout, Tokenized Cards, Mandates	Retry strategy, dunning emails
Treasury / payouts	Transfers, Virtual Accounts, Transactions	Idempotency, audit log
Bank-transfer checkout	Virtual Accounts, Webhooks	Real-time UI updates
BNPL / lending	Mandates, Direct Debits, Transactions	Mandate lifecycle UI
Pick depth over breadth
A judge would rather see one API used flawlessly with proper webhook handling and reconciliation than five APIs glued together.

Training
/
Build-Week Checklist
Module 13
3 min read
Build-Week Checklist
Knowledge checks · 0 / 1
0%
Run through this list before your submission. If any item is unchecked you will lose points — these are the same checks senior engineers use during a production launch.

Security
clientSecret and webhookSecret loaded from environment variables — not in source
All webhook handlers verify the nomba-signature HMAC
Idempotency: every external write keyed on a unique merchantTxRef
Correctness
All amounts converted to kobo before sending
Recipient name verified via /transfers/bank/lookup before transfers
Webhook handler is idempotent against duplicate requestId values
Over- and under-payment branches handled for virtual accounts
Operations
Nightly reconciliation job comparing /transactions to your ledger
Structured logging on every Nomba call with merchantTxRef tagged
Health-check endpoint your judges can hit to see green status
You're certification-ready
Mark this module complete to unlock the Certified Nomba Developer assessment.