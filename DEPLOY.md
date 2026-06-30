# NairaRails — Deployment Guide

---

## 1. Local Development

### Prerequisites

- Node.js 22+ (install via [nvm-windows](https://github.com/coreybutler/nvm-windows/releases/latest) on Windows)
- pnpm 9+

```powershell
# Install pnpm if you don't have it
corepack enable
corepack prepare pnpm@9.15.4 --activate
```

### First-time setup

```powershell
# Clone and enter the repo
cd nairarails

# Install all workspace dependencies
pnpm install

# Copy the environment file and fill in your values
cp .env.example .env
```

Open `.env` and fill in every value. For local dev the minimum required fields are:

```
PORT=3000
NODE_ENV=development
NOMBA_BASE_URL=https://sandbox.api.nomba.com/v1
NOMBA_CLIENT_ID=your_sandbox_client_id
NOMBA_CLIENT_SECRET=your_sandbox_client_secret
NOMBA_ACCOUNT_ID=your_parent_account_id
NOMBA_WEBHOOK_SECRET=your_webhook_secret
DATABASE_URL=your_supabase_session_pooler_url
FRONTEND_URL=http://localhost:5173
VITE_API_BASE=http://localhost:3000
```

### Build shared packages first

The API and web apps import from `@nairarails/shared-types` and `@nairarails/webhook-core`.
These must be built before the apps can resolve them:

```powershell
pnpm --filter @nairarails/shared-types build
pnpm --filter @nairarails/webhook-core build
```

You only need to rerun this if you change something inside `packages/`.

### Run the API

```powershell
# Development mode (tsx watch — restarts on file changes)
pnpm --filter @nairarails/api dev

# Or build and run the compiled output
pnpm --filter @nairarails/api build
pnpm --filter @nairarails/api start
```

API will be available at `http://localhost:3000`.
Confirm it's alive: `curl http://localhost:3000/health`

### Run the frontend

```powershell
pnpm --filter @nairarails/web dev
```

Frontend will be available at `http://localhost:5173`.

### Run everything at once (Turborepo)

```powershell
pnpm turbo run dev
```

This starts all `dev` scripts in parallel across the monorepo.

### Run tests

```powershell
# All packages
pnpm turbo run test

# Just the pure logic package
pnpm --filter @nairarails/webhook-core test
```

### Receiving webhooks locally

Nomba can't reach `localhost`. Use a tunnel while developing:

```powershell
# Option A — ngrok
ngrok http 3000
# Gives you: https://abc123.ngrok-free.app

# Option B — cloudflared
cloudflared tunnel --url http://localhost:3000
```

Register the tunnel URL with Nomba as:
`https://<your-tunnel-id>.ngrok-free.app/api/v1/webhooks/nomba`

> Re-register the URL every time the tunnel restarts — ngrok free tier gives a new
> hostname on each run. Use a paid ngrok plan or a persistent deployment to avoid this.

---

## 2. Deploy the API — Railway

Railway deploys the API. The `railway.toml` at the repo root already configures the
build and start commands — you don't need to set those manually.

### Steps

1. Push the repo to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Select the `nairarails` repository.
4. Railway detects `railway.toml` automatically.

### Environment variables to set in Railway

Go to your service → **Variables** tab and add every variable from `.env.example`.
Do not commit your real `.env` file — Railway's variable store is the source of truth
in production.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `NOMBA_BASE_URL` | `https://sandbox.api.nomba.com/v1` (swap for prod after KYC) |
| `NOMBA_CLIENT_ID` | Your Nomba sandbox client ID |
| `NOMBA_CLIENT_SECRET` | Your Nomba sandbox client secret |
| `NOMBA_ACCOUNT_ID` | Your Nomba parent account ID |
| `NOMBA_WEBHOOK_SECRET` | Your Nomba webhook secret |
| `DATABASE_URL` | Supabase **session pooler** URL (port 5432, not 6543) |
| `FRONTEND_URL` | Your Vercel deployment URL, e.g. `https://nairarails.vercel.app` |

> **Session pooler vs transaction pooler:** Express is long-lived. Always use Supabase's
> session pooler (port **5432**). The transaction pooler (port 6543) is for serverless
> functions and will drop connections unpredictably under Express.

### After first deploy

Railway gives you a public URL like `https://nairarails-api.up.railway.app`.

**Register your webhook with Nomba immediately** — even before Phase 3 logic is wired up.
The stub already returns `200` and logs the raw payload, which is all Nomba needs to
confirm delivery. Register this exact path:

```
https://nairarails-api.up.railway.app/api/v1/webhooks/nomba
```

If your Railway URL ever changes (e.g. you rename the service), re-register the new URL
with Nomba right away. Webhook delivery silently stops if the URL is stale.

### Things to watch for on Railway

- **Build failures:** Check the build logs. The most common cause is a missing environment
  variable that the build script reads at startup. Add it in the Variables tab and redeploy.
- **Health check failing:** Railway probes `/health` after deploy. If it returns non-200
  the deploy is marked as failed even if the process started. Confirm the route is live
  by hitting it manually.
- **Cold start on free tier:** Railway's free tier sleeps inactive services. Nomba webhook
  retries are limited — upgrade to a paid plan or keep the service warm if you're running
  a live demo.

---

## 3. Deploy the Frontend — Vercel

Vercel deploys `apps/web`. Because this is a monorepo you need to tell Vercel which
subdirectory to build from.

### Steps

1. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the `nairarails` repo.
2. In the **Configure Project** screen set **Root Directory** to `apps/web`.
3. Framework preset will auto-detect as **Vite** — leave it.
4. Build & output settings (Vercel usually infers these correctly from Vite, confirm they match):

| Setting | Value |
|---|---|
| Build Command | `pnpm build` |
| Output Directory | `dist` |
| Install Command | `pnpm install` |

### Environment variables to set in Vercel

Go to your project → **Settings** → **Environment Variables**:

| Variable | Value |
|---|---|
| `VITE_API_BASE` | Your Railway API URL, e.g. `https://nairarails-api.up.railway.app` |

> All `VITE_` prefixed variables are inlined at build time by Vite. They are not secret —
> they end up in the browser bundle. Never put `NOMBA_CLIENT_SECRET` or any server-side
> secret in a `VITE_` variable.

### Monorepo build scope (important)

By default Vercel rebuilds on every push, even commits that only touch `apps/api`.
Tell it to skip irrelevant builds by adding an **Ignored Build Step** command in
**Settings → Git**:

```bash
git diff HEAD^ HEAD --quiet -- apps/web packages/shared-types
```

This means: only build if `apps/web` or `packages/shared-types` changed. API-only
commits will be skipped, saving build minutes.

### Things to watch for on Vercel

- **`VITE_API_BASE` not set:** The frontend will make requests to `undefined` and every
  API call will 404. Double-check the env var is set and trigger a manual redeploy after
  adding it.
- **CORS errors in the browser:** The API's `FRONTEND_URL` on Railway must exactly match
  the Vercel domain (including `https://` and no trailing slash). If Vercel gives you a
  preview URL on a PR, it won't be in the allowed origins — add the preview domain to
  `FRONTEND_URL` or use a wildcard during development only.
- **Root directory wrong:** If Vercel builds from the repo root instead of `apps/web` it
  will fail because there's no top-level Vite config. Always confirm Root Directory is
  set to `apps/web` in project settings.

---

## 4. Connecting the two deployments

Once both are live:

1. Copy your Railway API URL.
2. Set `VITE_API_BASE` on Vercel to that URL.
3. Set `FRONTEND_URL` on Railway to your Vercel URL.
4. Redeploy both services (the env var changes need a fresh deploy to take effect).
5. Hit `https://your-railway-url.up.railway.app/health` — confirm `status: "healthy"`.
6. Open the Vercel frontend — confirm it loads without console errors.

---

## 5. Quick reference

```
# Local
pnpm install
pnpm --filter @nairarails/shared-types build
pnpm --filter @nairarails/webhook-core build
pnpm --filter @nairarails/api dev          # http://localhost:3000
pnpm --filter @nairarails/web dev          # http://localhost:5173
pnpm turbo run test                        # all tests

# Build everything
pnpm turbo run build

# Check types without emitting
pnpm turbo run type-check

# Database (run from apps/api or with --filter)
pnpm --filter @nairarails/api db:push      # push schema to DB without migrations (dev)
pnpm --filter @nairarails/api db:migrate   # apply migrations (production / CI)
pnpm --filter @nairarails/api db:studio    # open Prisma Studio GUI at localhost:5555

# Webhook tunnel (dev only)
ngrok http 3000
# then register https://<id>.ngrok-free.app/api/v1/webhooks/nomba with Nomba
```

### Database notes

- `db:push` is the fastest way to apply schema changes during development — it syncs
  your Supabase database directly from `schema.prisma` without creating migration files.
  Use it freely while iterating locally.
- `db:migrate` runs `prisma migrate deploy` which applies the versioned migration files
  in `prisma/migrations/`. Use this in production and CI — it is safe to run repeatedly
  (skips already-applied migrations).
- Before running either command, make sure `DATABASE_URL` in your `.env` points to
  Supabase's **session pooler** URL (port 5432). The transaction pooler (port 6543)
  does not support Prisma migrations.
- All `BigInt` fields in the schema (kobo amounts) are returned as JavaScript `BigInt`
  by Prisma. When serialising to JSON in route responses, convert them first:
  `Number(order.expectedAmountKobo)` — `JSON.stringify` will throw on raw `BigInt` values.
