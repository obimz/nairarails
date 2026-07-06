import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import { Redis } from "ioredis";
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

    redisClient.on("error", (err: Error) => {
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

// ─── Redis Store Factory ─────────────────────────────────────────────────────

function createRedisStore(prefix: string): RedisStore | undefined {
  if (!redisClient) return undefined;

  return new RedisStore({
    sendCommand: (...args: string[]) => redisClient!.call(...args) as Promise<any>,
    prefix,
  });
}

// ─── Auth Routes Limiter ──────────────────────────────────────────────────────
// Strict limit for /auth/register and /auth/login to prevent credential stuffing.

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore("rl:auth:"),
  handler: (_req, res) => {
    logger.warn({ path: _req.path }, "Rate limit exceeded");
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many authentication attempts. Please try again in 15 minutes.",
      },
    });
  },
});

// ─── API Routes Limiter ───────────────────────────────────────────────────────
// Per-API-key limit for authenticated routes (orders, exceptions, dashboard).

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per API key
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const apiKey = req.headers["x-api-key"];
    if (typeof apiKey === "string") {
      return `key:${apiKey.slice(0, 20)}`;
    }
    return `ip:${req.ip ?? "unknown"}`;
  },
  store: createRedisStore("rl:api:"),
  handler: (_req, res) => {
    logger.warn({ path: _req.path }, "Rate limit exceeded");
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded for this API key. Maximum 100 requests per minute.",
      },
    });
  },
});

// ─── Global Limiter ───────────────────────────────────────────────────────────
// Catch-all for all other routes (health, public docs, etc).

export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStore("rl:global:"),
  handler: (_req, res) => {
    logger.warn({ path: _req.path }, "Rate limit exceeded");
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests from this IP. Please try again later.",
      },
    });
  },
});
