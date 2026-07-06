/**
 * apiKeyAuth — authenticates requests via the `x-api-key` header.
 *
 * Keys are stored as SHA-256 hashes — the plaintext is never in the DB.
 * Lookup: hash the incoming key, then find by apiKeyHash.
 * Also checks apiKeyExpiresAt if set.
 *
 * On success: sets res.locals.merchant to the full Merchant row.
 * On failure: 401 with a structured error.
 *
 * Public routes (no apiKeyAuth):
 *   POST /api/v1/auth/register   — unauthenticated by definition
 *   POST /api/v1/auth/login      — unauthenticated by definition
 *   POST /api/v1/webhooks/nomba  — authenticated by Nomba HMAC, not API key
 *   GET  /health                 — always public
 */

import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { Merchant } from "@prisma/client";
import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";

// Augment Express types so res.locals.merchant is typed throughout the app.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      merchant: Merchant;
    }
  }
}

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const key = req.headers["x-api-key"];

    if (!key || typeof key !== "string") {
      res.status(401).json({
        error: { code: "MISSING_API_KEY", message: "Request requires an x-api-key header" },
      });
      return;
    }

    // Hash the incoming key and look up by hash — never compare plaintext
    const hash = crypto.createHash("sha256").update(key).digest("hex");
    const merchant = await prisma.merchant.findUnique({ where: { apiKeyHash: hash } });

    if (!merchant) {
      logger.warn({ path: req.path }, "Invalid API key rejected");
      res.status(401).json({
        error: { code: "INVALID_API_KEY", message: "The provided API key is not valid" },
      });
      return;
    }

    // Check expiry if set
    if (merchant.apiKeyExpiresAt && merchant.apiKeyExpiresAt < new Date()) {
      logger.warn({ path: req.path, merchantId: merchant.id }, "Expired API key rejected");
      res.status(401).json({
        error: { code: "INVALID_API_KEY", message: "This API key has expired — rotate it from your dashboard" },
      });
      return;
    }

    // Check email is verified
    if (!merchant.emailVerified) {
      res.status(403).json({
        error: { code: "EMAIL_NOT_VERIFIED", message: "Verify your email address before using the API" },
      });
      return;
    }

    // Check suspension status
    if (merchant.suspended) {
      logger.warn({ path: req.path, merchantId: merchant.id }, "Suspended merchant API key rejected");
      res.status(403).json({
        error: {
          code: "ACCOUNT_SUSPENDED",
          message: merchant.suspendedNote
            ? `Your account has been suspended: ${merchant.suspendedNote}`
            : "Your account has been suspended. Contact support to appeal.",
        },
      });
      return;
    }

    res.locals.merchant = merchant;
    next();
  } catch (err) {
    next(err);
  }
}
