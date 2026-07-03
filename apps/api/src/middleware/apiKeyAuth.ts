/**
 * apiKeyAuth — middleware that authenticates requests via the `x-api-key` header.
 *
 * On success: sets `res.locals.merchant` to the full Merchant row so downstream
 * handlers can read `res.locals.merchant.id` for per-merchant data scoping.
 *
 * On failure: returns 401 with a structured error matching the API contract.
 *
 * Routes that stay public (no apiKeyAuth):
 *   POST /api/v1/merchants/signup  — by definition unauthenticated
 *   POST /api/v1/webhooks/nomba   — authenticated by Nomba HMAC signature, not API key
 *   GET  /health, GET /           — always public
 */

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
  const key = req.headers["x-api-key"];

  if (!key || typeof key !== "string") {
    res.status(401).json({
      error: {
        code: "MISSING_API_KEY",
        message: "Request requires an x-api-key header",
      },
    });
    return;
  }

  const merchant = await prisma.merchant.findUnique({ where: { apiKey: key } });

  if (!merchant) {
    logger.warn({ path: req.path }, "Invalid API key rejected");
    res.status(401).json({
      error: {
        code: "INVALID_API_KEY",
        message: "The provided API key is not valid",
      },
    });
    return;
  }

  res.locals.merchant = merchant;
  next();
}
