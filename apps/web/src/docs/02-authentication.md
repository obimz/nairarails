# Authentication

NairaRails uses API keys for all programmatic access. Your dashboard uses a separate session — your API key is for your server, not your browser.

---

## API keys

Every API key starts with `nrk_live_`. After registering and verifying your email, your key is shown exactly once in the dashboard. Copy it immediately — it cannot be retrieved again. If you lose it, rotate it to get a new one.

### Sending your key

Include your key in the `x-api-key` header on every request:

```http
GET /api/v1/orders
x-api-key: nrk_live_3f9a2c1b...
```

Never send it as a query parameter (`?api_key=...`) — query parameters appear in server logs and browser history.

### Where to store it

Store your key in an environment variable on your server. Never hardcode it in source code or commit it to a repository.

```bash
# .env (never commit this file)
NAIRARAILS_API_KEY=nrk_live_3f9a2c1b...
```

```js
// server.js
const key = process.env.NAIRARAILS_API_KEY;
```

---

## Key management

You manage your key from the **Settings** page in your dashboard.

### Rotate

Rotating generates a new key and immediately invalidates the old one. Any requests using the old key will receive `401` after rotation. Update your server environment with the new key before rotating if you want zero downtime.

```http
POST /api/v1/merchants/keys/rotate
Authorization: Bearer <your-dashboard-session-token>
```

```json
{
  "apiKey": "nrk_live_newkey...",
  "issuedAt": "2026-07-04T10:00:00Z"
}
```

The new key is shown once in the dashboard at the time of rotation.

### Revoke

Revoking permanently invalidates your key with no replacement. Use this if your key is confirmed compromised. After revoking, issue a new key via the dashboard.

```http
POST /api/v1/merchants/keys/revoke
Authorization: Bearer <your-dashboard-session-token>
```

### Check key info

Returns the key prefix and issuance date — never the full key.

```http
GET /api/v1/merchants/keys
Authorization: Bearer <your-dashboard-session-token>
```

```json
{
  "prefix": "nrk_live_3f9a2c...",
  "issuedAt": "2026-07-04T09:00:00Z",
  "expiresAt": null
}
```

`expiresAt: null` means the key does not expire automatically.

---

## Error responses

| HTTP status | Code | Meaning |
|---|---|---|
| `401` | `INVALID_API_KEY` | Key is missing, malformed, revoked, or expired |
| `403` | `FORBIDDEN` | Key is valid but the requested resource belongs to a different merchant |
| `429` | `RATE_LIMITED` | Too many requests — see rate limits below |

---

## Rate limits

| Scope | Limit |
|---|---|
| Per API key | 100 requests / minute |
| Signup endpoint | 10 attempts / 15 minutes per IP |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 94
Retry-After: 60
```

When you exceed the limit, you receive `429`. Wait for the `Retry-After` seconds before retrying.
