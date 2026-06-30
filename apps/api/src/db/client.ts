// apps/api/src/db/client.ts
// Re-exports the Prisma singleton as the single import point for all DB access.
// Phase 3: any raw query helpers or transaction wrappers live alongside this file.
export { prisma } from "../lib/prisma.js";
