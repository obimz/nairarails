import { z } from "zod";

// ─── Split ────────────────────────────────────────────────────────────────────
// Each split party must have a verifiable bank account. percentage is an integer
// between 1–100. All amounts tracked in kobo (bigint-safe integers).
export const SplitSchema = z.object({
  party: z.string().min(1, "party name is required"),
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

// ─── Create Order ─────────────────────────────────────────────────────────────
// expected_amount is in KOBO. The refine() ensures splits total exactly 100.
export const CreateOrderRequestSchema = z
  .object({
    order_ref: z
      .string()
      .min(1, "order_ref is required")
      .max(64, "order_ref too long")
      .regex(/^[a-zA-Z0-9_-]+$/, "order_ref must be alphanumeric"),
    customer_name: z.string().min(1, "customer_name is required").max(100),
    customer_email: z.string().email("invalid email address").optional(),
    /** Amount in kobo — ₦1 = 100 kobo. Never accept floats here. */
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
export const OrderResponseSchema = z.object({
  order_ref: z.string(),
  virtual_account_number: z.string(),
  bank_name: z.string(),
  bank_code: z.string(),
  /** Amount in kobo */
  expected_amount_kobo: z.number().int().positive(),
  currency: z.literal("NGN"),
  status: z.enum(["pending", "paid", "underpayment", "overpayment", "unmatched"]),
  created_at: z.string().datetime(),
});

export type OrderResponse = z.infer<typeof OrderResponseSchema>;

// ─── Order List Item ──────────────────────────────────────────────────────────
export const OrderListItemSchema = z.object({
  order_ref: z.string(),
  customer_name: z.string(),
  /** Amount in kobo */
  expected_amount_kobo: z.number().int().nonnegative(),
  /** Amount in kobo — null until a payment arrives */
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
