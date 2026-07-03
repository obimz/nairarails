/**
 * Merchant schemas — API contract for merchant registration and management.
 */
import { z } from "zod";

// ─── Merchant Signup ──────────────────────────────────────────────────────────

export const MerchantSignupSchema = z.object({
  name: z.string().min(1, "name is required").max(100),
  email: z.string().email("invalid email address"),
  webhookUrl: z
    .string()
    .url("webhookUrl must be a valid URL")
    .optional(),
});

export type MerchantSignup = z.infer<typeof MerchantSignupSchema>;

// ─── Merchant Response ────────────────────────────────────────────────────────

export const MerchantResponseSchema = z.object({
  merchantId: z.string(),
  name: z.string(),
  apiKey: z.string(),
  message: z.string(),
});

export type MerchantResponse = z.infer<typeof MerchantResponseSchema>;

// ─── Outbound Merchant Webhook Payload ───────────────────────────────────────
// Shape POSTed to merchant.webhookUrl after each payment is classified.
// This is what a marketplace backend (Jumia, Jiji, etc.) receives from NairaRails.

export const MerchantWebhookPayloadSchema = z.object({
  event:                  z.literal("payment.classified"),
  order_ref:              z.string(),
  status:                 z.enum(["paid", "underpayment", "overpayment", "unmatched"]),
  received_amount_kobo:   z.number().int(),
  expected_amount_kobo:   z.number().int(),
  splits_executed:        z.boolean(),
  timestamp:              z.string().datetime(),
});

export type MerchantWebhookPayload = z.infer<typeof MerchantWebhookPayloadSchema>;
