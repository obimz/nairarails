// NairaRails uses Prisma (not Drizzle) for its database schema.
// The canonical schema lives in apps/api/prisma/schema.prisma.
//
// This file is intentionally empty — it exists only so the directory
// import path `../db/schema` doesn't produce a "module not found" error
// if any tooling references it. All DB access goes through:
//   apps/api/src/db/client.ts  →  apps/api/src/lib/prisma.ts
