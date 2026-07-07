/**
 * merchants.ts — merchant profile routes.
 *
 * POST /api/v1/merchants/signup — legacy compatibility endpoint.
 *   Still functional for the demo seed key workflow. Uses the new hashed key
 *   system (generateApiKey) instead of the old plaintext apiKey column.
 *   New integrations should use POST /api/v1/auth/register instead.
 *
 * GET /api/v1/merchants/me — authenticated profile lookup.
 */

import crypto from "crypto";
import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { MerchantSignupSchema } from "@nairarails/shared-types";
import { prisma } from "../db/client.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { jwtAuth } from "../middleware/jwtAuth.js";
import { generateApiKey } from "../lib/generateApiKey.js";
import { logger } from "../lib/logger.js";

const router: ExpressRouter = Router();

// ─── POST /api/v1/merchants/signup ────────────────────────────────────────────
// Legacy public signup — kept for demo seed compatibility.
// New merchants should use POST /api/v1/auth/register (requires password + email verification).
router.post(
  "/signup",
  validate(MerchantSignupSchema),
  async (req, res, next) => {
    try {
      const { name, email, webhookUrl } = req.body as import("@nairarails/shared-types").MerchantSignup;

      const existing = await prisma.merchant.findUnique({ where: { email } });
      if (existing) {
        throw new AppError(409, "DUPLICATE_MERCHANT_EMAIL", `Merchant email '${email}' is already registered`);
      }

      // Generate a hashed key using the new system
      const { raw, hash, prefix, issuedAt } = generateApiKey();
      // Generate webhook secret (Phase 15)
      const webhookSecret = crypto.randomBytes(32).toString("hex");

      const created = await prisma.merchant.create({
        data: {
          name,
          email,
          webhookUrl:    webhookUrl ?? null,
          webhookSecret, // Phase 15
          emailVerified: true,   // legacy path skips email verification
          apiKeyHash:    hash,
          apiKeyPrefix:  prefix,
          apiKeyIssuedAt: issuedAt,
        },
        select: { id: true, name: true },
      });

      res.status(201).json({
        merchantId: created.id,
        name:       created.name,
        apiKey:     raw,
        message:    "Store your API key securely — it will not be shown again.",
      });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        next(new AppError(409, "DUPLICATE_MERCHANT_EMAIL", "Merchant email is already registered"));
        return;
      }
      next(err);
    }
  }
);

// ─── GET /api/v1/merchants/me ─────────────────────────────────────────────────
router.get("/me", apiKeyAuth, async (_req, res, next) => {
  try {
    const merchant = res.locals.merchant;
    res.status(200).json({
      merchantId:  merchant.id,
      name:        merchant.name,
      email:       merchant.email,
      webhookUrl:  merchant.webhookUrl,
      createdAt:   merchant.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/v1/merchants/profile ─────────────────────────────────────────
// JWT-authenticated — updates name and/or webhookUrl for the logged-in merchant.
const ProfileUpdateSchema = z.object({
  name:                     z.string().min(2).max(100).optional(),
  webhookUrl:               z.string().url().nullable().optional(),
  settlementAccountNumber:  z.string().regex(/^\d{10}$/, "Settlement account number must be 10 digits").nullable().optional(),
  settlementBankCode:       z.string().min(3).max(10).nullable().optional(),
});

router.patch("/profile", jwtAuth, async (req, res, next) => {
  try {
    const parsed = ProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid request");
    }

    const { name, webhookUrl, settlementAccountNumber, settlementBankCode } = parsed.data;

    if (name === undefined && webhookUrl === undefined && settlementAccountNumber === undefined && settlementBankCode === undefined) {
      throw new AppError(422, "VALIDATION_ERROR", "Provide at least one field to update");
    }

    // If only one of the pair is provided, reject — both must be set or both cleared
    const settingAccount  = settlementAccountNumber !== undefined;
    const settingBankCode = settlementBankCode !== undefined;
    if (settingAccount !== settingBankCode) {
      throw new AppError(422, "VALIDATION_ERROR", "settlementAccountNumber and settlementBankCode must be updated together");
    }

    const merchant = res.locals.merchant;

    const updated = await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        ...(name                    !== undefined ? { name }                                          : {}),
        ...(webhookUrl              !== undefined ? { webhookUrl: webhookUrl ?? null }                : {}),
        ...(settlementAccountNumber !== undefined ? { settlementAccountNumber: settlementAccountNumber ?? null } : {}),
        ...(settlementBankCode      !== undefined ? { settlementBankCode: settlementBankCode ?? null }          : {}),
      },
    });

    res.status(200).json({
      merchantId:               updated.id,
      name:                     updated.name,
      webhookUrl:                updated.webhookUrl,
      settlementAccountNumber:  updated.settlementAccountNumber ?? null,
      settlementBankCode:        updated.settlementBankCode ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/merchants/webhook-secret/rotate ────────────────────────────
// Phase 15: Rotates the webhook secret used to sign outbound webhooks.
// The new secret is returned once — merchant must update their verification logic.
router.post("/webhook-secret/rotate", jwtAuth, async (_req, res, next) => {
  try {
    const merchant = res.locals.merchant;

    // Generate new 256-bit secret
    const newSecret = crypto.randomBytes(32).toString("hex");

    await prisma.merchant.update({
      where: { id: merchant.id },
      data:  { webhookSecret: newSecret },
    });

    logger.info({ merchantId: merchant.id }, "Webhook secret rotated");

    res.status(200).json({
      webhookSecret: newSecret,
      message: "Webhook secret rotated. Update your signature verification logic immediately — the old secret is now invalid.",
    });
  } catch (err) {
    next(err);
  }
});

export { router as merchantRouter };
