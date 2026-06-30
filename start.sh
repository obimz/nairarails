#!/bin/sh
# start.sh — Railway entrypoint
# 1. Apply any pending migrations (safe to run on every deploy — skips already-applied ones)
# 2. Start the API server
set -e

echo "→ Running database migrations..."
npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma

echo "→ Starting NairaRails API..."
node apps/api/dist/server.js
