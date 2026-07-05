# Quickstart

Get from zero to a working integration in under 10 minutes.

## Prerequisites

- A NairaRails account — [sign up here](/signup)
- Your API key (shown once after registration — store it somewhere safe)
- An HTTPS endpoint on your server to receive webhook notifications (optional but recommended)

---

## Step 1 — Create an order

When a buyer initiates checkout on your marketplace, call `POST /api/v1/orders`. Pass the order reference from your own system, the buyer's name, the amount they owe, and the bank account split for each party.

```http
POST /api/v1/orders
x-api-key: nrk_live_your_key_here
Content-Type: application/json
```

```json
{
  "order_ref": "ord-1001",
  "customer_name": "Emeka Okafor",
  "expected_amount_kobo": 500000,
  "currency": "NGN",
  "splits": [
    { "party": "seller",   "account_number": "0123456789", "bank_code": "058", "percentage": 85 },
    { "party": "platform", "account_number": "9876543210", "bank_code": "058", "percentage": 10 },
    { "party": "rider",    "account_number": "1122334455", "bank_code": "044", "percentage": 5  }
  ]
}
```

> **Amounts are always in kobo.** ₦5,000.00 = `500000` kobo. See [Amounts & Units](/docs/amounts) for details.

**Response:**

```json
{
  "order_ref": "ord-1001",
  "virtual_account_number": "9900012345",
  "bank_name": "Nombank MFB",
  "expected_amount_kobo": 500000,
  "currency": "NGN",
  "status": "pending",
  "created_at": "2026-07-04T09:00:00Z"
}
```

The `virtual_account_number` is a unique bank account number (NUBAN) for this order only.

---

## Step 2 — Give the buyer the account number

Display `virtual_account_number` and `bank_name` to your buyer at checkout. They pay that account via any standard Nigerian bank transfer — mobile banking, USSD, or internet banking.

```
Pay ₦5,000.00 to:
Account: 9900012345
Bank:    Nombank MFB
```

You do not need to tell the buyer anything else. The account is pre-linked to this order — NairaRails handles the matching automatically.

---

## Step 3 — Receive the webhook notification

Once payment arrives, NairaRails posts a `payment.classified` event to your registered webhook URL. This is how you know the payment has been processed.

```json
{
  "event": "payment.classified",
  "order_ref": "ord-1001",
  "status": "paid",
  "received_amount_kobo": 500000,
  "expected_amount_kobo": 500000,
  "splits_executed": true,
  "timestamp": "2026-07-04T09:14:22Z"
}
```

`status` will be one of: `paid`, `underpayment`, `overpayment`, or `unmatched`. See [Exceptions & Refunds](/docs/exceptions) for how to handle non-`paid` statuses.

To verify the payload came from NairaRails and wasn't forged, check the `nairarails-signature` header. See [Webhooks](/docs/webhooks) for the verification code.

---

## Step 4 — Check order status any time

You don't have to wait for a webhook. Poll the reconciliation endpoint at any time:

```http
GET /api/v1/orders/ord-1001/reconciliation
x-api-key: nrk_live_your_key_here
```

```json
{
  "order_ref": "ord-1001",
  "status": "paid",
  "expected_amount_kobo": 500000,
  "received_amount_kobo": 500000,
  "shortfall_kobo": 0,
  "excess_kobo": 0,
  "splits_executed": true,
  "splits": [
    { "party": "seller",   "percentage": 85, "amount_paid_kobo": 425000, "status": "executed" },
    { "party": "platform", "percentage": 10, "amount_paid_kobo": 50000,  "status": "executed" },
    { "party": "rider",    "percentage": 5,  "amount_paid_kobo": 25000,  "status": "executed" }
  ]
}
```

---

## Complete Node.js example

```js
const NAIRARAILS_KEY = process.env.NAIRARAILS_API_KEY;
const BASE = "https://api.nairarails.com";

// 1. Create order when buyer checks out
async function createOrder(orderRef, buyerName, amountNaira, splits) {
  const res = await fetch(`${BASE}/api/v1/orders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": NAIRARAILS_KEY,
    },
    body: JSON.stringify({
      order_ref: orderRef,
      customer_name: buyerName,
      expected_amount_kobo: Math.round(amountNaira * 100),
      currency: "NGN",
      splits,
    }),
  });
  return res.json();
}

// 2. Receive webhook (Express example)
app.post("/webhooks/nairarails", express.json(), (req, res) => {
  const sig = req.headers["nairarails-signature"];
  // verify sig — see Webhooks docs
  const { order_ref, status } = req.body;
  console.log(`Order ${order_ref} is now: ${status}`);
  res.sendStatus(200);
});
```

---

## What happens next

- `paid` — splits have been executed. Each party received their percentage of the order amount. You're done.
- `underpayment` / `overpayment` — the order is in your [Exceptions queue](/dashboard/exceptions). Use the dashboard or the API to resolve it.
- If you never received a webhook — check your registered webhook URL in [Settings](/dashboard/settings), then check `GET /api/v1/orders/:ref/reconciliation` directly.
