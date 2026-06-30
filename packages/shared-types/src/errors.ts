import { z } from "zod";

// ─── Error Codes ──────────────────────────────────────────────────────────────
export const ErrorCodeEnum = z.enum([
  // Validation
  "VALIDATION_ERROR",
  // Not found
  "ORDER_NOT_FOUND",
  "EXCEPTION_NOT_FOUND",
  // Business logic
  "SPLITS_DO_NOT_SUM_TO_100",
  "DUPLICATE_ORDER_REF",
  "DUPLICATE_WEBHOOK_EVENT",
  // Nomba integration
  "NOMBA_AUTH_FAILED",
  "NOMBA_VA_CREATION_FAILED",
  "NOMBA_TRANSFER_FAILED",
  "NOMBA_LOOKUP_FAILED",
  // Webhook security
  "INVALID_WEBHOOK_SIGNATURE",
  // Internal
  "INTERNAL_ERROR",
  "DATABASE_ERROR",
]);

export type ErrorCode = z.infer<typeof ErrorCodeEnum>;

// ─── API Error shape ──────────────────────────────────────────────────────────
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeEnum,
    message: z.string(),
    /** Which request field caused the error, if applicable */
    field: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

// ─── Dashboard Overview ───────────────────────────────────────────────────────
export const DashboardOverviewSchema = z.object({
  date: z.string().date(),
  /** Total in kobo */
  total_expected_today_kobo: z.number().int().nonnegative(),
  /** Total in kobo */
  total_received_today_kobo: z.number().int().nonnegative(),
  orders_paid: z.number().int().nonnegative(),
  orders_pending: z.number().int().nonnegative(),
  orders_underpayment: z.number().int().nonnegative(),
  orders_overpayment: z.number().int().nonnegative(),
  exceptions_open: z.number().int().nonnegative(),
});

export type DashboardOverview = z.infer<typeof DashboardOverviewSchema>;
