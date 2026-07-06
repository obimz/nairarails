# Rate Limiting — Route Map

## Auth Limiter — 10 requests / 15 minutes (per IP)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v1/auth/register` | Prevent credential stuffing |
| POST | `/api/v1/auth/login` | Prevent brute-force login |

---

## API Limiter — 100 requests / 1 minute (per API key, fallback to IP)

| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/v1/orders` | Create order |
| GET | `/api/v1/orders` | List orders |
| GET | `/api/v1/orders/:order_ref/reconciliation` | Reconciliation detail |
| GET | `/api/v1/exceptions` | List exceptions |
| POST | `/api/v1/exceptions/:order_ref/refund-excess` | Trigger refund |
| GET | `/api/v1/dashboard/overview` | Dashboard stats |
| POST | `/api/v1/merchants/keys/issue` | Issue API key |
| POST | `/api/v1/merchants/keys/rotate` | Rotate API key |
| POST | `/api/v1/merchants/keys/revoke` | Revoke API key |
| GET | `/api/v1/merchants/keys` | List API keys |

---

## Global Limiter — 200 requests / 1 minute (per IP)

All routes not covered above fall through to this limiter:

| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/health` | Health check |
| POST | `/api/v1/webhooks/nomba` | Inbound payment webhook |
| POST | `/api/v1/auth/logout` | Logout (JWT-protected) |
| GET | `/api/v1/auth/me` | Current user (JWT-protected) |
| POST | `/api/v1/merchants/webhook-secret/rotate` | Rotate webhook secret |
| POST | `/api/v1/merchants/signup` | Legacy signup (deprecated) |
| GET | `/api/v1/merchants/me` | Legacy merchant info (deprecated) |
| GET | `/api/v1/admin/reconcile-check` | Admin reconcile (dev only) |

---

## Summary

| Tier | Limit | Window | Key | Redis Prefix |
|------|-------|--------|-----|--------------|
| Auth | 10 | 15 min | IP | `rl:auth:` |
| API | 100 | 1 min | `x-api-key` (first 20 chars) | `rl:api:` |
| Global | 200 | 1 min | IP | `rl:global:` |

## Response on 429

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "..."
  }
}
```

## Storage

- **Production:** Redis (via `REDIS_URL` env var) — shared across instances
- **Development:** In-memory fallback — per-process, resets on restart
