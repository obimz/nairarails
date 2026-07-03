import { Router, type Router as ExpressRouter } from "express";
import { MerchantSignupSchema } from "@nairarails/shared-types";
import { prisma } from "../db/client.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";
import { apiKeyAuth } from "../middleware/apiKeyAuth.js";

const router: ExpressRouter = Router();

// ─── POST /api/v1/merchants/signup ────────────────────────────────────────────
// Public — no API key required. Creates a new merchant and issues an API key.
// The API key is returned exactly once in the 201 response and never again.
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

      const created = await prisma.merchant.create({
        data: {
          name,
          email,
          webhookUrl: webhookUrl ?? null,
        },
        select: {
          id:     true,
          name:   true,
          apiKey: true,
        },
      });

      const prefixedApiKey = `nrk_live_${created.apiKey}`;
      await prisma.merchant.update({
        where: { id: created.id },
        data:  { apiKey: prefixedApiKey },
      });

      res.status(201).json({
        merchantId: created.id,
        name:       created.name,
        apiKey:     prefixedApiKey,
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
// Authenticated — requires x-api-key header.
// Returns the calling merchant's own profile. The apiKey field is never returned
// after the initial 201 — this matches standard infrastructure behaviour.
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

export { router as merchantRouter };
