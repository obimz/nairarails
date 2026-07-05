/**
 * jwtAuth.ts — middleware for dashboard routes authenticated via Supabase session JWT.
 *
 * Expects: Authorization: Bearer <supabase_access_token>
 * Verifies the token with Supabase, then loads the merchant row linked to that UID.
 * Sets res.locals.merchant just like apiKeyAuth does, so route handlers are interchangeable.
 */

import { type Request, type Response, type NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { prisma } from "../db/client.js";
import { AppError } from "./errorHandler.js";

export async function jwtAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers["authorization"];
  if (!authHeader?.startsWith("Bearer ")) {
    next(new AppError(401, "INVALID_API_KEY", "Authorization header with Bearer token required"));
    return;
  }

  const token = authHeader.slice(7);

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    next(new AppError(401, "INVALID_API_KEY", "Invalid or expired session token"));
    return;
  }

  const merchant = await prisma.merchant.findUnique({
    where: { supabaseUid: user.id },
  });

  if (!merchant) {
    next(new AppError(401, "INVALID_API_KEY", "No merchant account linked to this session"));
    return;
  }

  res.locals.merchant = merchant;
  next();
}
