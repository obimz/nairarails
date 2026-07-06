/**
 * authAny — accepts either `x-api-key` or `Authorization: Bearer <jwt>`.
 *
 * Standard dual-credential middleware for routes that must be reachable by
 * both:
 *   - Server-side / CI integrations using a static API key
 *   - Browser dashboard sessions using a Supabase JWT
 *
 * Resolution order:
 *   1. If `x-api-key` header present → delegate to apiKeyAuth
 *   2. If `Authorization: Bearer ...` header present → delegate to jwtAuth
 *   3. Neither present → 401 MISSING_API_KEY (mirrors apiKeyAuth's error shape)
 *
 * On success: res.locals.merchant is set identically by both delegates,
 * so downstream route handlers are credential-agnostic.
 */

import type { Request, Response, NextFunction } from "express";
import { apiKeyAuth } from "./apiKeyAuth.js";
import { jwtAuth }    from "./jwtAuth.js";

export function authAny(req: Request, res: Response, next: NextFunction): void {
  if (req.headers["x-api-key"]) {
    apiKeyAuth(req, res, next);
    return;
  }

  if (req.headers["authorization"]?.startsWith("Bearer ")) {
    jwtAuth(req, res, next);
    return;
  }

  res.status(401).json({
    error: {
      code:    "MISSING_API_KEY",
      message: "Request requires either an x-api-key header or an Authorization: Bearer token",
    },
  });
}
