import { z } from "zod";

// ─── Enums ────────────────────────────────────────────────────────────────────
export const OrderStatusEnum = z.enum([
  "pending",
  "paid",
  "underpayment",
  "overpayment",
  "unmatched",
]);

export type OrderStatus = z.infer<typeof OrderStatusEnum>;

export const SplitStatusEnum = z.enum([
  "pending",
  "executed",
  "blocked",
  "failed",
]);

export type SplitStatus = z.infer<typeof SplitStatusEnum>;

// ─── Split Result ─────────────────────────────────────────────────────────────
export const SplitResultSchema = z.object({
  party: z.string(),
  account_number: z.string(),
  bank_code: z.string(),
  percentage: z.number().int().min(1).max(100),
  /** Calculated payout in kobo — null until the split is executed */
  amount_paid_kobo: z.number().int().nonnegative().nullable(),
  status: SplitStatusEnum,
  /** Nomba transfer reference, set once the payout is initiated */
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
  /** Amount in kobo, present for payment/split/refund events */
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
  /** Amount in kobo */
  expected_amount_kobo: z.number().int().nonnegative(),
  /** Amount in kobo — null until payment arrives */
  received_amount_kobo: z.number().int().nonnegative().nullable(),
  status: OrderStatusEnum,
  /** Positive kobo shortfall for underpayment, 0 otherwise */
  shortfall_kobo: z.number().int().nonnegative(),
  /** Positive kobo excess for overpayment, 0 otherwise */
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
  /** Amount in kobo */
  expected_amount_kobo: z.number().int().nonnegative(),
  /** Amount in kobo */
  received_amount_kobo: z.number().int().nonnegative(),
  /** kobo shortfall, 0 for non-underpayment */
  shortfall_kobo: z.number().int().nonnegative(),
  /** kobo excess, 0 for non-overpayment */
  excess_kobo: z.number().int().nonnegative(),
  raised_at: z.string().datetime(),
  resolved: z.boolean(),
  resolved_at: z.string().datetime().nullable(),
});

export type Exception = z.infer<typeof ExceptionSchema>;

export const ExceptionListResponseSchema = z.object({
  results: z.array(ExceptionSchema),
  total_count: z.number().int().nonnegative(),
});

export type ExceptionListResponse = z.infer<typeof ExceptionListResponseSchema>;
