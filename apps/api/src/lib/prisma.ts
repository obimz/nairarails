import { PrismaClient, Prisma } from "@prisma/client";

// Prevent multiple PrismaClient instances during tsx watch hot-reloads.
// In production there is only one module instance so this is a no-op there.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient(): PrismaClient {
  const base = new PrismaClient({
    log:
      process.env["NODE_ENV"] === "production"
        ? ["error"]
        : ["warn", "error"],
  });

  // ── Dev-only hot-reload reconnection ──────────────────────────────────────
  // tsx watch tears down the module graph on each file change. The global
  // singleton keeps the PrismaClient object alive but its internal engine may
  // be in a disconnected state after a reload.
  //
  // Strategy: use a $extends query interceptor (Prisma v5+ API) to catch
  // PrismaClientInitializationError on any query, call $connect(), then retry
  // the operation once. After the retry the pool is live again.
  if (process.env["NODE_ENV"] !== "production") {
    let reconnecting: Promise<void> | null = null;

    function ensureConnected(): Promise<void> {
      if (reconnecting) return reconnecting;
      reconnecting = base.$connect().finally(() => { reconnecting = null; });
      return reconnecting;
    }

    return base.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            try {
              return await query(args);
            } catch (err) {
              if (
                err instanceof Prisma.PrismaClientInitializationError ||
                (err instanceof Error && err.constructor.name === "PrismaClientInitializationError")
              ) {
                // Re-establish the pool and retry exactly once.
                await ensureConnected();
                return query(args);
              }
              throw err;
            }
          },
        },
      },
    }) as unknown as PrismaClient;
  }

  return base;
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (process.env["NODE_ENV"] !== "production") {
  globalForPrisma.prisma = prisma;
}
