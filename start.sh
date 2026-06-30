#!/bin/sh
# start.sh — Railway entrypoint
# Uses the locally installed prisma binary (pinned to v6 via package.json)
# instead of npx which would download the latest version at runtime.
set -e

echo "→ Running database migrations..."
./node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma

echo "→ Starting NairaRails API..."
node apps/api/dist/server.js
