#!/bin/sh
# start.sh — Railway entrypoint
# In a pnpm workspace, package binaries live in the package's own node_modules/.bin,
# not the repo root. Prisma is installed in apps/api, so the binary is there.
set -e

echo "→ Running database migrations..."
./apps/api/node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma

echo "→ Starting NairaRails API..."
node apps/api/dist/server.js
