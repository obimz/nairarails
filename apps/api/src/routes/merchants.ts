import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { MerchantSignupSchema } from "@nairarails/shared-types";
import { prisma } from "../db/client.js";
import { validate } from "../middleware/validate.js";
import { AppError } from "../middleware/errorHandler.js";

const router: ExpressRouter = Router();

const MerchantMeQuerySchema = z.object({
  merchantId: z.string().min(1, "merchantId is required"),
});

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
          id: true,
          name: true,
          apiKey: true,
        },
      });

      const prefixedApiKey = `nrk_live_${created.apiKey}`;
      await prisma.merchant.update({
        where: { id: created.id },
        data: { apiKey: prefixedApiKey },
      });

      res.status(201).json({
        merchantId: created.id,
        name: created.name,
        apiKey: prefixedApiKey,
        message: "Store your API key securely — it will not be shown again.",
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

router.get("/me", async (req, res, next) => {
  try {
    // TEMP: query param auth until Phase 15 adds apiKeyAuth middleware
    const parsed = MerchantMeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_ERROR", "Invalid query parameters");
    }

    const merchant = await prisma.merchant.findUnique({
      where: { id: parsed.data.merchantId },
      select: {
        id: true,
        name: true,
        email: true,
        webhookUrl: true,
        createdAt: true,
      },
    });

    if (!merchant) {
      throw new AppError(404, "MERCHANT_NOT_FOUND", `Merchant '${parsed.data.merchantId}' not found`);
    }

    res.status(200).json({
      merchantId: merchant.id,
      name: merchant.name,
      email: merchant.email,
      webhookUrl: merchant.webhookUrl,
      createdAt: merchant.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export { router as merchantRouter };