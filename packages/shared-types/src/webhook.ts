import { z } from "zod";

// ─── Nomba Webhook Event Types ────────────────────────────────────────────────
// Source: Training.md Module 08 — common event types table
export const NombaEventTypeEnum = z.enum([
  "payment_success",
  "virtual_account.funded",
  "transfer.success",
  "transfer.failed",
  "mandate.debit_success",
]);

export type NombaEventType = z.infer<typeof NombaEventTypeEnum>;

// ─── Transaction payload inside a webhook ────────────────────────────────────
export const NombaWebhookTransactionSchema = z.object({
  transactionId: z.string(),
  /** The NUBAN that received the funds */
  aliasAccountNumber: z.string().optional(),
  /** Amount in kobo */
  transactionAmount: z.number().int().nonnegative(),
  currency: z.string().default("NGN"),
  /** ISO 8601 timestamp of the transaction */
  time: z.string(),
  type: z.string(),
  responseCode: z.string().optional(),
  /** Your merchantTxRef — links back to your order_ref */
  merchantTxRef: z.string().optional(),
  /** Sender details — captured for refunds */
  senderAccountNumber: z.string().optional(),
  senderBankCode: z.string().optional(),
  senderName: z.string().optional(),
  narration: z.string().optional(),
});

export type NombaWebhookTransaction = z.infer<typeof NombaWebhookTransactionSchema>;

// ─── Merchant payload inside a webhook ───────────────────────────────────────
export const NombaMerchantSchema = z.object({
  userId: z.string(),
  walletId: z.string(),
  accountId: z.string().optional(),
});

export type NombaMerchant = z.infer<typeof NombaMerchantSchema>;

// ─── Full Nomba webhook envelope ──────────────────────────────────────────────
// This is the root shape Nomba POSTs to your webhook URL.
// The signature is computed over the raw body bytes — do NOT parse before verifying.
export const NombaWebhookEnvelopeSchema = z.object({
  /** A stable per-event ID — use this for idempotency. */
  requestId: z.string(),
  event_type: NombaEventTypeEnum,
  data: z.object({
    transaction: NombaWebhookTransactionSchema,
    merchant: NombaMerchantSchema,
  }),
});

export type NombaWebhookEnvelope = z.infer<typeof NombaWebhookEnvelopeSchema>;

// ─── Webhook signature header name ───────────────────────────────────────────
export const NOMBA_SIGNATURE_HEADER = "nomba-signature" as const;
