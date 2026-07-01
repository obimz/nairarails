/**
 * Reconciliation schemas — API contract §2.3, §2.4, §2.5
 * Covers order classification, per-party split outcomes, exceptions, and refund responses.
 */
import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Lifecycle state of an order, set by the webhook reconciliation handler. */
export const OrderStatusEnum = z.enum([
  "pending",      // No payment received yet.
  "paid",         // Exact payment received; splits executed.
  "underpayment", // Received less than expected; splits blocked.
  "overpayment",  // Received more than expected; excess queued for refund.
  "unmatched",    // Payment arrived but no matching order_ref was found.
]);

export type OrderStatus = z.infer<typeof OrderStatusEnum>;

/** Execution state of a single payout to one split party. */
export const SplitStatusEnum = z.enum([
  "pending",  // Awaiting payment classification.
  "executed", // Nomba transfer completed successfully.
  "blocked",  // Withheld due to underpayment.
  "failed",   // Nomba transfer was rejected.
]);

export type SplitStatus = z.infer<typeof SplitStatusEnum>;

// ─── Split Result ─────────────────────────────────────────────────────────────

export const SplitResultSchema = z.object({
  party: z.string(),
  account_number: z.string(),
  bank_code: z.string(),
  percentage: z.number().int().min(1).max(100),
  /** Kobo payout amount — null until the split is executed. */
  amount_paid_kobo: z.number().int().nonnegative().nullable(),
  status: SplitStatusEnum,
  /** Nomba `merchantTxRef` for this transfer — null until the payout is initiated. */
  nomba_transfer_ref: z.string().nullable(),
});

export type SplitResult = z.infer<typeof SplitResultSchema>;

// ─── Audit Trail ─────────────────────────────────────────────────────────────

export const AuditTrailEventEnum = z.enum([
  "va_created",
  "payment_received",
  "classified",
  "splits_executed",
  "split_failed",
  "refund_initiated",
  "refund_completed",
  "notification_sent",
]);

export type AuditTrailEvent = z.infer<typeof AuditTrailEventEnum>;

export const AuditTrailEntrySchema = z.object({
  event: AuditTrailEventEnum,
  timestamp: z.string().datetime(),
  /** Present on payment, split, and refund events. */
  amount_kobo: z.number().int().nonnegative().optional(),
  status: z.string().optional(),
  channel: z.string().optional(),
  detail: z.string().optional(),
});

export type AuditTrailEntry = z.infer<typeof AuditTrailEntrySchema>;

// ─── Reconciliation Detail ────────────────────────────────────────────────────

export const ReconciliationDetailSchema = z.object({
  order_ref: z.string(),
  virtual_account_number: z.string(),
  expected_amount_kobo: z.number().int().nonnegative(),
  /** Null until the funding webhook is processed. */
  received_amount_kobo: z.number().int().nonnegative().nullable(),
  status: OrderStatusEnum,
  /** max(0, expected − received). Non-zero only for underpayments. */
  shortfall_kobo: z.number().int().nonnegative(),
  /** max(0, received − expected). Non-zero only for overpayments. */
  excess_kobo: z.number().int().nonnegative(),
  splits_executed: z.boolean(),
  splits: z.array(SplitResultSchema),
  audit_trail: z.array(AuditTrailEntrySchema),
});

export type ReconciliationDetail = z.infer<typeof ReconciliationDetailSchema>;

// ─── Exception ────────────────────────────────────────────────────────────────

export const ExceptionTypeEnum = z.enum(["underpayment", "overpayment", "unmatched"]);
export type ExceptionType = z.infer<typeof ExceptionTypeEnum>;

export const ExceptionSchema = z.object({
  order_ref: z.string(),
  type: ExceptionTypeEnum,
  expected_amount_kobo: z.number().int().nonnegative(),
  received_amount_kobo: z.number().int().nonnegative(),
  shortfall_kobo: z.number().int().nonnegative(),
  excess_kobo: z.number().int().nonnegative(),
  raised_at: z.string().datetime(),
  resolved: z.boolean(),
  /** Null until the exception is actioned. */
  resolved_at: z.string().datetime().nullable(),
});

export type Exception = z.infer<typeof ExceptionSchema>;

export const ExceptionListResponseSchema = z.object({
  results: z.array(ExceptionSchema),
  total_count: z.number().int().nonnegative(),
});

export type ExceptionListResponse = z.infer<typeof ExceptionListResponseSchema>;

// ─── Refund Excess Response ───────────────────────────────────────────────────

/**
 * Response for POST /api/v1/exceptions/:order_ref/refund-excess (§2.5).
 * `status` is a literal — if the refund fails the route throws an error instead.
 */
export const RefundExcessResponseSchema = z.object({
  order_ref: z.string(),
  /** Kobo amount returned to the original payer. Equals the order's excess_kobo. */
  refunded_amount_kobo: z.number().int().positive(),
  status: z.literal("resolved"),
  /** Nomba `merchantTxRef` for the outbound refund transfer. */
  nomba_transfer_ref: z.string(),
});

export type RefundExcessResponse = z.infer<typeof RefundExcessResponseSchema>;
