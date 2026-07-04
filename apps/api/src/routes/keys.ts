/**
 * keys.ts — API key lifecycle management. All routes require JWT auth (dashboard session).
 *
 * POST /api/v1/merchants/keys/issue   — issue first key after email verification
 * POST /api/v1/merchants/keys/rotate  — invalidate old key, issue new one
 * POST /api/v1/merchants/keys/revoke  — permanently invalidate key (no replacement)
 * GET  /api/v1/merchants/keys         — return key prefix + dates (never the hash or plaintext)
 */

import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { jwtAuth } from "../middleware/jwtAuth.js";
import { AppError } from "../middleware/errorHandler.js";
import { generateApiKey } from "../lib/generateApiKey.js";
import { logger } from "../lib/logger.js";

const router: ExpressRouter = Router();

const IssueSchema = z.object({
  expiresAt: z.string().datetime().optional(), // ISO 8601 — null means never expires
});

// ─── POST /api/v1/merchants/keys/issue ───────────────────────────────────────
router.post("/merchants/keys/issue", jwtAuth, async (req, res, next) => {
  try {
    const merchant = res.locals.merchant;

    if (!merchant.emailVerified) {
      throw new AppError(403, "EMAIL_NOT_VERIFIED", "Verify your email address before issuing an API key");
    }

    if (merchant.apiKeyHash) {
      throw new AppError(409, "DUPLICATE_ORDER_REF", "An API key is already issued. Use /keys/rotate to get a new one.");
    }

    const parsed = IssueSchema.safeParse(req.body ?? {});
    const expiresAt = parsed.success && parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : null;

    const { raw, hash, prefix, issuedAt } = generateApiKey();

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        apiKeyHash:      hash,
        apiKeyPrefix:    prefix,
        apiKeyIssuedAt:  issuedAt,
        apiKeyExpiresAt: expiresAt,
      },
    });

    logger.info({ merchantId: merchant.id }, "API key issued");

    res.status(201).json({
      apiKey:    raw,       // shown once — merchant must copy immediately
      prefix,
      issuedAt:  issuedAt.toISOString(),
      expiresAt: expiresAt?.toISOString() ?? null,
      message:   "Store this key securely — it will not be shown again.",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/merchants/keys/rotate ──────────────────────────────────────
router.post("/merchants/keys/rotate", jwtAuth, async (req, res, next) => {
  try {
    const merchant = res.locals.merchant;

    const parsed = IssueSchema.safeParse(req.body ?? {});
    const expiresAt = parsed.success && parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : null;

    const { raw, hash, prefix, issuedAt } = generateApiKey();

    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        apiKeyHash:      hash,
        apiKeyPrefix:    prefix,
        apiKeyIssuedAt:  issuedAt,
        apiKeyExpiresAt: expiresAt,
      },
    });

    logger.info({ merchantId: merchant.id }, "API key rotated — old key invalidated");

    res.status(200).json({
      apiKey:    raw,
      prefix,
      issuedAt:  issuedAt.toISOString(),
      expiresAt: expiresAt?.toISOString() ?? null,
      message:   "Old key is immediately invalid. Store this key securely.",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/merchants/keys/revoke ──────────────────────────────────────
router.post("/merchants/keys/revoke", jwtAuth, async (req, res, next) => {
  try {
    const merchant = res.locals.merchant;

    if (!merchant.apiKeyHash) {
      throw new AppError(422, "VALIDATION_ERROR", "No active API key to revoke");
    }

    // Null out the hash — any request using the old key will get 401 immediately
    await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        apiKeyHash:      null,
        apiKeyPrefix:    null,
        apiKeyIssuedAt:  null,
        apiKeyExpiresAt: null,
      },
    });

    logger.info({ merchantId: merchant.id }, "API key revoked");

    res.status(200).json({
      message: "API key revoked. Issue a new key via POST /merchants/keys/issue.",
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/merchants/keys ──────────────────────────────────────────────
router.get("/merchants/keys", jwtAuth, async (_req, res, next) => {
  try {
    const merchant = res.locals.merchant;

    if (!merchant.apiKeyHash) {
      res.status(200).json({ active: false, prefix: null, issuedAt: null, expiresAt: null });
      return;
    }

    res.status(200).json({
      active:    true,
      prefix:    merchant.apiKeyPrefix,
      issuedAt:  merchant.apiKeyIssuedAt?.toISOString() ?? null,
      expiresAt: merchant.apiKeyExpiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    next(err);
  }
});

export { router as keysRouter };
