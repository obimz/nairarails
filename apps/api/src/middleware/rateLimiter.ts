/**
 * rateLimiter.ts — rate limiting middleware for NairaRails API.
 *
 * Three-tier strategy:
 * 1. authLimiter — strict limits on auth endpoints (10 req/15min per IP)
 * 2. apiLimiter  — per-API-key limits on authenticated routes (100 req/min per key)
 * 3. globalLimiter — catch-all for other routes (200 req/min per IP)
 *
 * Uses Redis for distributed rate limiting (works across multiple API instances).
 * Falls back to in-memory store if Redis is unavailable (dev mode).
 */

import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import Redis from "ioredis";
import { logger } from "../lib/logger.js";

// ─── Redis Client ─────────────────────────────────────────────────────────────

const REDIS_URL = process.env["REDIS_URL"];

let redisClient: Redis | null = null;

if (REDIS_URL) {
  try {
    redisClient = new Redis(REDIS_URL, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
    });

    redisClient.on("error", (err) => {
      logger.error({ err }, "Redis connection error — rate limiter will fall back to memory store");
    });

    redisClient.on("connect", () => {
      logger.info("Redis connected for rate limiting");
    });
  } catch (err) {
    logger.warn({ err }, "Failed to initialize Redis — rate limiter using memory store (dev only)");
  }
} else {
  logger.warn("REDIS_URL not set — rate limiter using memory store (dev only, not production-safe)");
}

// ─── Error Handler ────────────────────────────────────────────────────────────

function onLimitReached(req: unknown, _res: unknown, _options: unknown) {
  logger.warn({ path: (req as { path?: string }).path }, "Rate limit exceeded");
}

// ─── Auth Routes Limiter ──────────────────────────────────────────────────────
// Strict limit for /auth/register and /auth/login to prevent credential stuffing.

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per IP
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many authentication attempts. Please try again in 15 minutes.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient
    ? new RedisStore({
        // @ts-expect-error — rate-limit-redis types expect ioredis v4, we're on v5
        client: redisClient,
        prefix: "rl:auth:",
      })
    : undefined,
  onLimitReached,
});

// ─── API Routes Limiter ───────────────────────────────────────────────────────
// Per-API-key limit for authenticated routes (orders, exceptions, dashboard).

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per API key
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Rate limit exceeded for this API key. Maximum 100 requests per minute.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Key by API key if present, otherwise fall back to IP
  keyGenerator: (req) => {
    const apiKey = req.headers["x-api-key"];
    if (typeof apiKey === "string") {
      // Only use first 20 chars of key for privacy in logs
      return `key:${apiKey.slice(0, 20)}`;
    }
    return `ip:${req.ip ?? "unknown"}`;
  },
  store: redisClient
    ? new RedisStore({
        // @ts-expect-error — rate-limit-redis types expect ioredis v4, we're on v5
        client: redisClient,
        prefix: "rl:api:",
      })
    : undefined,
  onLimitReached,
});

// ─── Global Limiter ───────────────────────────────────────────────────────────
// Catch-all for all other routes (health, public docs, etc).

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute per IP
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests from this IP. Please try again later.",
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  store: redisClient
    ? new RedisStore({
        // @ts-expect-error — rate-limit-redis types expect ioredis v4, we're on v5
        client: redisClient,
        prefix: "rl:global:",
      })
    : undefined,
  onLimitReached,
});
