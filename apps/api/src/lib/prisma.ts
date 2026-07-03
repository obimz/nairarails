import { PrismaClient } from "@prisma/client";

// Prevent multiple PrismaClient instances during tsx watch hot-reloads.
// In production there is only one module instance so this is a no-op there.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log:
      process.env["NODE_ENV"] === "production"
        ? ["error"]
        : ["warn", "error"],
  });
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}
