import { PrismaClient } from "@prisma/client";

// Prevent multiple PrismaClient instances during tsx watch hot-reloads.
// In production there is only one module instance so this is a no-op there.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "production"
        ? ["error"]
        : ["query", "warn", "error"],
  });

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}
