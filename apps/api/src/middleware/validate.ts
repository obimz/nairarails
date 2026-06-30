import type { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

/**
 * Middleware factory that validates `req.body` against a Zod schema.
 * On failure it short-circuits with a structured 422 matching the API error contract.
 */
export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.errors[0];
      res.status(422).json({
        error: {
          code: "VALIDATION_ERROR",
          message: first?.message ?? "Validation failed",
          field: first?.path.join("."),
        },
      });
      return;
    }
    // Attach the parsed + coerced body so routes get the typed value.
    req.body = result.data as T;
    next();
  };
}

/**
 * Format a ZodError into a flat list of field-message pairs — useful for
 * returning all validation failures at once rather than only the first.
 */
export function formatZodError(error: ZodError): { field: string; message: string }[] {
  return error.errors.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
}
