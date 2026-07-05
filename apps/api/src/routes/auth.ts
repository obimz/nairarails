/**
 * auth.ts — registration and login via Supabase Auth.
 *
 * POST /api/v1/auth/register  — create Supabase Auth user + Merchant row
 * POST /api/v1/auth/login     — sign in, return session token
 * POST /api/v1/auth/logout    — sign out
 * GET  /api/v1/auth/me        — return merchant profile (JWT-auth)
 */

import crypto from "crypto";
import { Router, type Router as ExpressRouter } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { jwtAuth } from "../middleware/jwtAuth.js";
import { AppError } from "../middleware/errorHandler.js";
import { logger } from "../lib/logger.js";

const router: ExpressRouter = Router();

const RegisterSchema = z.object({
  name:       z.string().min(2).max(100),
  email:      z.string().email(),
  password:   z.string().min(8, "Password must be at least 8 characters"),
  webhookUrl: z.string().url().optional(),
});

const LoginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ─── POST /api/v1/auth/register ───────────────────────────────────────────────
router.post("/auth/register", async (req, res, next) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_ERROR", parsed.error.errors[0]?.message ?? "Invalid request");
    }
    const { name, email, password, webhookUrl } = parsed.data;

    const existing = await prisma.merchant.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, "DUPLICATE_MERCHANT_EMAIL", `Email '${email}' is already registered`);
    }

    // Use signUp (not admin.createUser) so Supabase sends the confirmation email.
    // admin.createUser bypasses the email flow entirely regardless of email_confirm.
    const frontendUrl = process.env["FRONTEND_URL"] ?? "http://localhost:5173";
    const { data: authData, error: authError } = await supabaseAdmin.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${frontendUrl}/auth/callback`,
      },
    });

    if (authError || !authData.user) {
      logger.error({ err: authError }, "Supabase Auth user creation failed");
      throw new AppError(500, "INTERNAL_ERROR", authError?.message ?? "Failed to create auth user");
    }

    // Generate webhook secret on signup (Phase 15)
    const webhookSecret = crypto.randomBytes(32).toString("hex");

    const merchant = await prisma.merchant.create({
      data: {
        name,
        email,
        webhookUrl:    webhookUrl ?? null,
        webhookSecret, // Phase 15: secret for signing outbound webhooks
        supabaseUid:   authData.user.id,
        emailVerified: false,
      },
    });

    logger.info({ merchantId: merchant.id, email }, "Merchant registered — verification email sent");

    res.status(201).json({
      merchantId: merchant.id,
      message:    "Account created. Check your email to verify your address before using the API.",
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/auth/login ──────────────────────────────────────────────────
router.post("/auth/login", async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(422, "VALIDATION_ERROR", "Email and password required");
    }
    const { email, password } = parsed.data;

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });

    if (error || !data.session) {
      throw new AppError(401, "INVALID_API_KEY", "Invalid email or password");
    }

    // Sync emailVerified flag if Supabase confirms but our DB hasn't caught up
    if (data.user.email_confirmed_at != null) {
      await prisma.merchant.updateMany({
        where: { supabaseUid: data.user.id, emailVerified: false },
        data:  { emailVerified: true },
      });
    }

    const merchant = await prisma.merchant.findUnique({ where: { supabaseUid: data.user.id } });
    if (!merchant) {
      throw new AppError(401, "INVALID_API_KEY", "No merchant account found for this user");
    }

    res.status(200).json({
      accessToken:   data.session.access_token,
      refreshToken:  data.session.refresh_token,
      expiresAt:     data.session.expires_at,
      merchantId:    merchant.id,
      name:          merchant.name,
      emailVerified: merchant.emailVerified,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/v1/auth/logout ─────────────────────────────────────────────────
router.post("/auth/logout", jwtAuth, async (_req, res, next) => {
  try {
    res.status(200).json({ message: "Signed out" });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/v1/auth/me ──────────────────────────────────────────────────────
router.get("/auth/me", jwtAuth, async (req, res, next) => {
  try {
    let merchant = res.locals.merchant;

    // Sync emailVerified if not yet set in our DB.
    // This covers the email-confirmation callback flow: the user confirms via
    // the Supabase email link, the Supabase session is established client-side,
    // and the first thing the dashboard does is call /auth/me — at which point
    // we check the live Supabase user and update our DB flag.
    if (!merchant.emailVerified) {
      const token = (req.headers["authorization"] as string).slice(7);
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);

      if (user?.email_confirmed_at != null) {
        merchant = await prisma.merchant.update({
          where: { id: merchant.id },
          data:  { emailVerified: true },
        });
      }
    }

    res.status(200).json({
      merchantId:    merchant.id,
      name:          merchant.name,
      email:         merchant.email,
      webhookUrl:    merchant.webhookUrl,
      emailVerified: merchant.emailVerified,
      keyPrefix:     merchant.apiKeyPrefix ?? null,
      keyIssuedAt:   merchant.apiKeyIssuedAt?.toISOString() ?? null,
      keyExpiresAt:  merchant.apiKeyExpiresAt?.toISOString() ?? null,
      createdAt:     merchant.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
