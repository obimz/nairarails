import type { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { logger } from "../lib/logger.js";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Central error handler — must be registered LAST via `app.use(errorHandler)`.
 * Maps any thrown error to the contract's `{ error: { code, message } }` shape.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    logger.warn({ code: err.code, field: err.field }, err.message);
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.field !== undefined ? { field: err.field } : {}),
      },
    });
    return;
  }

  // Prisma: database unreachable / cold-start / tsx hot-reload connection reset.
  // PrismaClientInitializationError is NOT a subclass of Error in all Prisma versions,
  // so we check the constructor name as a fallback.
  if (
    err instanceof Prisma.PrismaClientInitializationError ||
    (err instanceof Error && err.constructor.name === "PrismaClientInitializationError")
  ) {
    logger.warn({ err }, "Database temporarily unreachable (PrismaClientInitializationError)");
    res.status(503).json({
      error: {
        code:    "SERVICE_UNAVAILABLE",
        message: "Database is temporarily unavailable — please retry in a moment",
      },
    });
    return;
  }

  // Prisma: query errors (unique constraint violations, etc.) — don't leak internals
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    logger.warn({ code: err.code }, "Prisma known request error");
    res.status(500).json({
      error: {
        code:    "DATABASE_ERROR",
        message: "A database error occurred",
      },
    });
    return;
  }

  // Unknown errors — log and return a generic 500.
  logger.error(err, "Unhandled error");
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
    },
  });
}
