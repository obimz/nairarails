/**
 * Error and dashboard schemas — API contract §3 and §2.6
 */
import { z } from "zod";

// ─── Error Codes ──────────────────────────────────────────────────────────────

export const ErrorCodeEnum = z.enum([
  "VALIDATION_ERROR",           // Field present but fails a business rule (422).
  "ORDER_NOT_FOUND",            // No order matches the given order_ref (404).
  "EXCEPTION_NOT_FOUND",        // No open exception for the given order_ref (404).
  "SPLITS_DO_NOT_SUM_TO_100",   // Split percentages do not total 100 (422).
  "DUPLICATE_ORDER_REF",        // order_ref already exists (409).
  "DUPLICATE_WEBHOOK_EVENT",    // requestId already processed — silently ignored internally.
  "NOMBA_AUTH_FAILED",          // Could not obtain or refresh the Nomba access token (502).
  "NOMBA_VA_CREATION_FAILED",   // Nomba rejected the virtual account creation request (502).
  "NOMBA_TRANSFER_FAILED",      // Nomba rejected a payout or refund transfer (502).
  "NOMBA_LOOKUP_FAILED",        // Nomba bank account lookup failed (502).
  "INVALID_WEBHOOK_SIGNATURE",  // HMAC verification of an inbound webhook failed (401).
  "INTERNAL_ERROR",             // Unhandled exception (500).
  "DATABASE_ERROR",             // Prisma/Postgres query failed unexpectedly (500).
]);

export type ErrorCode = z.infer<typeof ErrorCodeEnum>;

// ─── API Error Envelope ───────────────────────────────────────────────────────

/** Shared error shape for all NairaRails API failure responses. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: ErrorCodeEnum,
    message: z.string(),
    /** The request field that caused the error, if applicable (e.g. "splits"). */
    field: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

// ─── Dashboard Overview ───────────────────────────────────────────────────────

/** Response for GET /api/v1/dashboard/overview (§2.6). All amounts in kobo. */
export const DashboardOverviewSchema = z.object({
  date: z.string().date(),
  total_expected_today_kobo: z.number().int().nonnegative(),
  total_received_today_kobo: z.number().int().nonnegative(),
  orders_paid: z.number().int().nonnegative(),
  orders_pending: z.number().int().nonnegative(),
  orders_underpayment: z.number().int().nonnegative(),
  orders_overpayment: z.number().int().nonnegative(),
  exceptions_open: z.number().int().nonnegative(),
});

export type DashboardOverview = z.infer<typeof DashboardOverviewSchema>;
