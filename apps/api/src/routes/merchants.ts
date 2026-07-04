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

import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { MerchantSignupSchema } from "@nairarails/shared-types";
import { prisma } from "../db/client.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";
import { jwtAuth } from "../middleware/jwtAuth.js";
import { generateApiKey } from "../lib/generateApiKey.js";

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

      const created = await prisma.merchant.create({
        data: {
          name,
          email,
          webhookUrl:    webhookUrl ?? null,
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
  name:       z.string().min(2).max(100).optional(),
  webhookUrl: z.string().url().nullable().optional(),
});

router.patch("/profile", jwtAuth, async (req, res, next) => {
  try {
    const parsed = ProfileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid request");
    }

    const { name, webhookUrl } = parsed.data;

    // Nothing to update
    if (name === undefined && webhookUrl === undefined) {
      throw new AppError(422, "VALIDATION_ERROR", "Provide at least one field to update (name, webhookUrl)");
    }

    const merchant = res.locals.merchant;

    const updated = await prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        ...(name       !== undefined ? { name }                     : {}),
        ...(webhookUrl !== undefined ? { webhookUrl: webhookUrl ?? null } : {}),
      },
    });

    res.status(200).json({
      merchantId: updated.id,
      name:       updated.name,
      webhookUrl: updated.webhookUrl,
    });
  } catch (err) {
    next(err);
  }
});

export { router as merchantRouter };
