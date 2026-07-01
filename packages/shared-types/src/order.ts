/**
 * Order schemas — API contract §2.1 and §2.2
 * All monetary amounts are in kobo (₦1 = 100 kobo). Floats are never accepted.
 */
import { z } from "zod";

// ─── Split ────────────────────────────────────────────────────────────────────

export const SplitSchema = z.object({
  party: z.string().min(1, "party name is required"),
  /** Standard Nigerian NUBAN — always exactly 10 digits. */
  account_number: z
    .string()
    .length(10, "Nigerian account numbers are exactly 10 digits")
    .regex(/^\d{10}$/, "account_number must be numeric"),
  bank_code: z.string().min(3, "bank_code is required"),
  percentage: z
    .number()
    .int("percentage must be a whole number")
    .min(1, "percentage must be at least 1")
    .max(100, "percentage cannot exceed 100"),
});

export type Split = z.infer<typeof SplitSchema>;

// ─── Create Order Request ─────────────────────────────────────────────────────

/**
 * Validates POST /api/v1/orders.
 * The `.refine()` enforces that all split percentages sum to exactly 100 —
 * without this, a partial total would silently leave funds undisbursed.
 */
export const CreateOrderRequestSchema = z
  .object({
    order_ref: z
      .string()
      .min(1, "order_ref is required")
      .max(64, "order_ref too long")
      .regex(/^[a-zA-Z0-9_-]+$/, "order_ref must be alphanumeric"),
    customer_name: z.string().min(1, "customer_name is required").max(100),
    customer_email: z.string().email("invalid email address").optional(),
    /** Order value in kobo. ₦5,000 = 500000. */
    expected_amount_kobo: z
      .number()
      .int("amount must be in whole kobo, no decimals")
      .positive("amount must be positive"),
    currency: z.literal("NGN").default("NGN"),
    splits: z
      .array(SplitSchema)
      .min(1, "at least one split is required")
      .max(10, "maximum 10 split parties"),
  })
  .refine(
    (data) => data.splits.reduce((sum, s) => sum + s.percentage, 0) === 100,
    {
      message: "splits[].percentage must sum to exactly 100",
      path: ["splits"],
    }
  );

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

// ─── Order Response ───────────────────────────────────────────────────────────

/**
 * Response for POST /api/v1/orders (201 Created).
 * `bank_name` reflects the actual Nomba-issuing MFB — do not hardcode "Nomba".
 */
export const OrderResponseSchema = z.object({
  order_ref: z.string(),
  virtual_account_number: z.string(),
  bank_name: z.string(),
  expected_amount_kobo: z.number().int().positive(),
  currency: z.literal("NGN"),
  /** Always "pending" on creation; updated by the webhook handler. */
  status: z.enum(["pending", "paid", "underpayment", "overpayment", "unmatched"]),
  created_at: z.string().datetime(),
});

export type OrderResponse = z.infer<typeof OrderResponseSchema>;

// ─── Order List Item ──────────────────────────────────────────────────────────

export const OrderListItemSchema = z.object({
  order_ref: z.string(),
  customer_name: z.string(),
  expected_amount_kobo: z.number().int().nonnegative(),
  /** Null until a payment webhook is processed. */
  received_amount_kobo: z.number().int().nonnegative().nullable(),
  status: z.enum(["pending", "paid", "underpayment", "overpayment", "unmatched"]),
  virtual_account_number: z.string(),
  created_at: z.string().datetime(),
});

export type OrderListItem = z.infer<typeof OrderListItemSchema>;

// ─── Order List Response ──────────────────────────────────────────────────────

export const OrderListResponseSchema = z.object({
  results: z.array(OrderListItemSchema),
  page: z.number().int().positive(),
  page_size: z.number().int().positive(),
  total_count: z.number().int().nonnegative(),
});

export type OrderListResponse = z.infer<typeof OrderListResponseSchema>;
