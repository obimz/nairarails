#!/bin/sh
# start.sh — Railway entrypoint

echo "→ Running database migrations..."
./apps/api/node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma || {
  echo "⚠️  Migration failed or already up to date — continuing to start server..."
}

echo "→ Starting NairaRails API..."
node apps/api/dist/server.js
