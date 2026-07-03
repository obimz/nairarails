/**
 * Nomba webhook schemas — API contract §4.4 – §4.6
 *
 * IMPORTANT: The route must use `express.raw({ type: "application/json" })`
 * so the raw body bytes reach signature verification intact. Parsing the body
 * before verifying will silently break the HMAC check on every request.
 */
import { z } from "zod";

// ─── Event Types ──────────────────────────────────────────────────────────────

/**
 * Virtual account funding fires as `payment_success`, not a separate event.
 * Identify VA funding by also checking `data.transaction.type === "vact_transfer"`.
 */
export const NombaEventTypeEnum = z.enum([
  "payment_success",
  "transfer.success",
  "transfer.failed",
  "mandate.debit_success",
]);

export type NombaEventType = z.infer<typeof NombaEventTypeEnum>;

// ─── Transaction Block ────────────────────────────────────────────────────────

export const NombaWebhookTransactionSchema = z.object({
  transactionId: z.string(),
  /** "vact_transfer" for virtual account funding events. */
  type: z.string(),
  /** Amount received in NAIRA (not kobo) — Nomba always sends naira here.
   *  Multiply by 100 immediately after parsing to get kobo before reconciliation. */
  transactionAmount: z.number().nonnegative(),
  fee: z.number().nonnegative().optional(),
  /** Required input to the signature hash — do not discard. */
  time: z.string(),
  /** Pass an empty string to the signature hash if this field is absent. */
  responseCode: z.string().optional(),
  narration: z.string().optional(),
  aliasAccountNumber: z.string().optional(),
  aliasAccountName: z.string().optional(),
  /**
   * The `accountRef` set when the virtual account was created — i.e. your `order_ref`.
   * Use this to look up the matching order, not `merchantTxRef`.
   */
  aliasAccountReference: z.string().optional(),
  aliasAccountType: z.string().optional(),
  sessionId: z.string().optional(),
  originatingFrom: z.string().optional(),
});

export type NombaWebhookTransaction = z.infer<typeof NombaWebhookTransactionSchema>;

// ─── Merchant Block ───────────────────────────────────────────────────────────

/** `userId` and `walletId` are required inputs to the signature hash (positions 3 and 4). */
export const NombaMerchantSchema = z.object({
  userId: z.string(),
  walletId: z.string(),
  walletBalance: z.number().optional(),
});

export type NombaMerchant = z.infer<typeof NombaMerchantSchema>;

// ─── Customer Block ───────────────────────────────────────────────────────────

/**
 * Sender details for the inbound transfer.
 * Persist these on webhook receipt — they are needed to issue a refund if the
 * order turns out to be an overpayment.
 */
export const NombaCustomerSchema = z.object({
  senderName: z.string().optional(),
  /** Source account number — required for the refund lookup + transfer call. */
  accountNumber: z.string().optional(),
  bankCode: z.string().optional(),
  bankName: z.string().optional(),
});

export type NombaCustomer = z.infer<typeof NombaCustomerSchema>;

// ─── Webhook Envelope ─────────────────────────────────────────────────────────

/**
 * Root shape of every Nomba webhook POST body.
 * Parse this AFTER signature verification — never trust the payload before it.
 */
export const NombaWebhookEnvelopeSchema = z.object({
  /** Idempotency key — store in `webhook_events.request_id` before processing. */
  requestId: z.string(),
  event_type: NombaEventTypeEnum,
  data: z.object({
    transaction: NombaWebhookTransactionSchema,
    merchant: NombaMerchantSchema,
    /** Present for VA funding events; may be absent on others. */
    customer: NombaCustomerSchema.optional(),
  }),
});

export type NombaWebhookEnvelope = z.infer<typeof NombaWebhookEnvelopeSchema>;

// ─── Signature Header Names ───────────────────────────────────────────────────

/**
 * Signature scheme (confirmed from live sandbox):
 *   HMAC-SHA256( event_type:requestId:userId:walletId:transactionId:type:time:responseCode:timestamp )
 *   → Base64-encoded → compared against `nomba-signature`.
 * `nomba-sig-value` is an alias Nomba uses on some sandbox deliveries — check both.
 */
export const NOMBA_SIGNATURE_HEADER   = "nomba-signature"           as const;
export const NOMBA_TIMESTAMP_HEADER   = "nomba-timestamp"           as const;
export const NOMBA_SIG_VALUE_HEADER   = "nomba-sig-value"           as const;
export const NOMBA_SIG_ALGO_HEADER    = "nomba-signature-algorithm" as const;
export const NOMBA_SIG_VERSION_HEADER = "nomba-signature-version"   as const;
