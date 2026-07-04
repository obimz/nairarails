# Webhooks

After each payment is processed, NairaRails sends a `payment.classified` event to your registered webhook URL. This is the primary way to know a payment has been resolved without polling.

---

## Registering your webhook URL

Set your webhook URL during registration, or update it any time from the **Settings** page in your dashboard. The URL must be publicly reachable over HTTPS.

---

## The `payment.classified` event

NairaRails POSTs this payload to your webhook URL as `application/json`:

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

### Fields

| Field | Type | Description |
|---|---|---|
| `event` | string | Always `"payment.classified"` |
| `order_ref` | string | Your order reference, as provided when the order was created |
| `status` | string | Payment classification: `paid`, `underpayment`, `overpayment`, or `unmatched` |
| `received_amount_kobo` | integer | Amount actually received, in kobo |
| `expected_amount_kobo` | integer | Amount the order was created with, in kobo |
| `splits_executed` | boolean | `true` if split transfers were sent; `false` if held (underpayment) |
| `timestamp` | string | ISO 8601 timestamp of classification |

---

## Verifying the signature

Every webhook delivery includes two headers:

```
nairarails-signature: <hex string>
nairarails-timestamp: <ISO 8601 timestamp>
```

The signature is `HMAC-SHA256(webhookSecret, JSON.stringify(body))` encoded as a hex string. Your webhook secret is shown once in the dashboard when your account is created and can be rotated from Settings.

**Always verify the signature before acting on a webhook.** Any HTTP endpoint is reachable by anyone — verification confirms the payload came from NairaRails.

### Verification in Node.js

```js
const crypto = require("crypto");

function verifyNairailsWebhook(rawBody, signatureHeader, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)          // raw Buffer or string — before any JSON.parse
    .digest("hex");

  // Use timingSafeEqual to prevent timing attacks
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signatureHeader, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Express example
app.post("/webhooks/nairarails", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["nairarails-signature"];
  const secret = process.env.NAIRARAILS_WEBHOOK_SECRET;

  if (!verifyNairailsWebhook(req.body, sig, secret)) {
    return res.status(401).send("Invalid signature");
  }

  const payload = JSON.parse(req.body.toString());
  const { order_ref, status } = payload;

  // handle the event
  console.log(`Order ${order_ref}: ${status}`);

  res.sendStatus(200);
});
```

> **Important:** pass the raw request body to the HMAC function — the bytes before JSON parsing. If you parse the body first and then re-stringify, byte-order and whitespace differences can cause valid signatures to fail.

---

## Responding to webhooks

Return a `2xx` status code within **5 seconds**. Anything else is treated as a delivery failure.

- Return `200` immediately once you've received the payload — do your processing asynchronously if needed.
- Do not return `500` to signal a processing error on your side. Return `200` and handle the error internally — retries are not guaranteed.

---

## Delivery behaviour

- NairaRails delivers each event **once**. There is no automatic retry on failure.
- If delivery fails (your server is unreachable or returns non-2xx), the event is logged on our side. You can check the order status at any time via `GET /api/v1/orders/:ref/reconciliation`.
- Duplicate delivery is possible in rare infrastructure edge cases. Your handler should be idempotent — processing the same `order_ref` + `status` twice should produce the same result as processing it once.

---

## Webhook secret rotation

If your webhook secret is compromised, rotate it from the **Settings** page. After rotation:

1. The new secret is shown once — copy it immediately.
2. Update your server's `NAIRARAILS_WEBHOOK_SECRET` environment variable.
3. All future deliveries will use the new secret. Deliveries in flight at rotation time may use the old secret — allow a brief transition window before dropping the old one.
