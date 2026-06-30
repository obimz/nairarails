import crypto from "crypto";

/**
 * The fields Nomba joins with ":" to build the HMAC input, in this exact order.
 * Source: confirmed real Nomba webhook spec (not Training.md which describes
 * a simpler raw-body version that does not match production behaviour).
 */
export interface NombaSignatureFields {
  event_type: string;
  requestId: string;
  userId: string;       // data.merchant.userId
  walletId: string;     // data.merchant.walletId
  transactionId: string;// data.transaction.transactionId
  type: string;         // data.transaction.type
  time: string;         // data.transaction.time
  responseCode: string; // data.transaction.responseCode (empty string if absent)
  timestamp: string;    // value of the `nomba-timestamp` request header
}

/**
 * Verify a Nomba webhook signature.
 *
 * Algorithm (confirmed real spec):
 *   1. Build a colon-joined string from the fields listed in NombaSignatureFields
 *   2. HMAC-SHA256 that string with your webhook secret
 *   3. Base64-encode the digest
 *   4. Timing-safe compare against the `nomba-signature` header value
 *
 * @param fields          Extracted fields from the parsed payload + request headers
 * @param signatureHeader Value of the `nomba-signature` header
 * @param secret          Your NOMBA_WEBHOOK_SECRET
 * @returns true if the signature is valid, false otherwise (always fails closed)
 */
export function verifyNombaWebhook(
  fields: NombaSignatureFields,
  signatureHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  try {
    const hashingPayload = [
      fields.event_type,
      fields.requestId,
      fields.userId,
      fields.walletId,
      fields.transactionId,
      fields.type,
      fields.time,
      fields.responseCode,
      fields.timestamp,
    ].join(":");

    const expected = crypto
      .createHmac("sha256", secret)
      .update(hashingPayload)
      .digest("base64");

    // Timing-safe comparison on the base64 strings.
    // Both must be the same byte length — if they differ, the signature is wrong.
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signatureHeader);

    if (expectedBuf.length !== receivedBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    // Always fail closed — never let a verification error crash the server.
    return false;
  }
}
