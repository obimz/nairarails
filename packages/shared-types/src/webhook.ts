import { z } from "zod";

// ─── Nomba Webhook Event Types ────────────────────────────────────────────────
// The only real event for virtual account funding is `payment_success`
// where data.transaction.type === "vact_transfer".
// "virtual_account.funded" does NOT exist in the real Nomba API.
export const NombaEventTypeEnum = z.enum([
  "payment_success",
  "transfer.success",
  "transfer.failed",
  "mandate.debit_success",
]);

export type NombaEventType = z.infer<typeof NombaEventTypeEnum>;

// ─── Transaction block ────────────────────────────────────────────────────────
// "vact_transfer" is the type value for a virtual account funding event.
export const NombaWebhookTransactionSchema = z.object({
  transactionId:        z.string(),
  /** "vact_transfer" for virtual account funding */
  type:                 z.string(),
  /** Amount in kobo */
  transactionAmount:    z.number().nonnegative(),
  fee:                  z.number().nonnegative().optional(),
  /** ISO 8601 timestamp — required field in the signature hash */
  time:                 z.string(),
  responseCode:         z.string().optional(),
  narration:            z.string().optional(),
  /** The NUBAN that received the funds */
  aliasAccountNumber:   z.string().optional(),
  aliasAccountName:     z.string().optional(),
  /**
   * THIS is the order reference — set as `accountRef` when the VA was created.
   * Use this to look up the matching order, not merchantTxRef.
   */
  aliasAccountReference: z.string().optional(),
  aliasAccountType:     z.string().optional(),
  sessionId:            z.string().optional(),
  originatingFrom:      z.string().optional(),
});

export type NombaWebhookTransaction = z.infer<typeof NombaWebhookTransactionSchema>;

// ─── Merchant block ───────────────────────────────────────────────────────────
// These fields are inputs to the signature hash — all three are required.
export const NombaMerchantSchema = z.object({
  userId:        z.string(),
  walletId:      z.string(),
  walletBalance: z.number().optional(),
});

export type NombaMerchant = z.infer<typeof NombaMerchantSchema>;

// ─── Customer block ───────────────────────────────────────────────────────────
// Sender details — use these for refunds, not fields on the transaction object.
export const NombaCustomerSchema = z.object({
  senderName:    z.string().optional(),
  accountNumber: z.string().optional(),
  bankCode:      z.string().optional(),
  bankName:      z.string().optional(),
});

export type NombaCustomer = z.infer<typeof NombaCustomerSchema>;

// ─── Full webhook envelope ────────────────────────────────────────────────────
export const NombaWebhookEnvelopeSchema = z.object({
  /** Stable per-event UUID — use for idempotency */
  requestId:  z.string(),
  event_type: NombaEventTypeEnum,
  data: z.object({
    transaction: NombaWebhookTransactionSchema,
    merchant:    NombaMerchantSchema,
    customer:    NombaCustomerSchema.optional(),
  }),
});

export type NombaWebhookEnvelope = z.infer<typeof NombaWebhookEnvelopeSchema>;

// ─── Signature header names ───────────────────────────────────────────────────
export const NOMBA_SIGNATURE_HEADER   = "nomba-signature"           as const;
export const NOMBA_TIMESTAMP_HEADER   = "nomba-timestamp"           as const;
export const NOMBA_SIG_VALUE_HEADER   = "nomba-sig-value"           as const;
export const NOMBA_SIG_ALGO_HEADER    = "nomba-signature-algorithm" as const;
export const NOMBA_SIG_VERSION_HEADER = "nomba-signature-version"   as const;
