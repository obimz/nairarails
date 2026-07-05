# Errors

All error responses from NairaRails use a consistent shape regardless of the endpoint:

```json
{
  "error": {
    "code": "ORDER_NOT_FOUND",
    "message": "Order 'ord-9999' not found"
  }
}
```

- `code` — a machine-readable string. Use this in your code to branch on specific error types.
- `message` — a human-readable description. Suitable for logging; do not display directly to end users.

---

## Error codes

### Authentication errors

| Code | HTTP | Meaning | Fix |
|---|---|---|---|
| `INVALID_API_KEY` | 401 | Key is missing, malformed, revoked, or expired | Check the `x-api-key` header is present and the key is correct |
| `EMAIL_NOT_VERIFIED` | 403 | Account exists but email has not been verified | Complete email verification before using the API |
| `FORBIDDEN` | 403 | Key is valid but resource belongs to a different merchant | You can only access your own orders and exceptions |

### Validation errors

| Code | HTTP | Meaning | Fix |
|---|---|---|---|
| `VALIDATION_ERROR` | 422 | Request body or params failed validation | Check the `message` field for which field is invalid |
| `SPLITS_DONT_SUM` | 422 | Split percentages do not add up to 100 | Adjust percentages so they sum to exactly 100 |
| `DUPLICATE_ORDER_REF` | 409 | An order with this `order_ref` already exists | Use a unique `order_ref` per order |
| `DUPLICATE_MERCHANT_EMAIL` | 409 | This email is already registered | Sign in instead, or use a different email |

### Resource errors

| Code | HTTP | Meaning | Fix |
|---|---|---|---|
| `ORDER_NOT_FOUND` | 404 | No order with that reference exists on your account | Check the `order_ref` — it is case-sensitive |

### Rate limiting

| Code | HTTP | Meaning | Fix |
|---|---|---|---|
| `RATE_LIMITED` | 429 | Too many requests | Wait for the `Retry-After` header value (seconds) before retrying |

### Server errors

| Code | HTTP | Meaning | Fix |
|---|---|---|---|
| `INTERNAL_ERROR` | 500 | Unexpected server error | Retry once after a short delay. If it persists, contact support with your `order_ref` and the timestamp. |

---

## Handling errors in code

```js
async function createOrder(payload) {
  const res = await fetch("https://api.nairarails.com/api/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.NAIRARAILS_API_KEY,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const { error } = await res.json();
    switch (error.code) {
      case "DUPLICATE_ORDER_REF":
        // This order was already created — fetch it instead
        return getOrder(payload.order_ref);
      case "VALIDATION_ERROR":
        throw new Error(`Invalid order: ${error.message}`);
      case "INVALID_API_KEY":
        throw new Error("Check your NAIRARAILS_API_KEY environment variable");
      default:
        throw new Error(`NairaRails error: ${error.code}`);
    }
  }

  return res.json();
}
```
