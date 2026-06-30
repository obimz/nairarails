import crypto from "crypto";

/**
 * Verify a Nomba webhook signature.
 *
 * Nomba signs the raw request body with HMAC-SHA256 using your webhook secret
 * and sends the hex digest in the `nomba-signature` header.
 *
 * IMPORTANT: `rawBody` must be the original Buffer/bytes before any JSON parsing.
 * Mounting the route with `express.raw()` or fastify-raw-body is mandatory — any
 * re-serialisation of the parsed object will produce a different digest.
 *
 * @param rawBody        The raw request body as a Buffer or string
 * @param signatureHeader The value of the `nomba-signature` header
 * @param secret          Your NOMBA_WEBHOOK_SECRET environment variable
 * @returns true if the signature is valid, false otherwise
 */
export function verifyNombaWebhook(
  rawBody: Buffer | string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!signatureHeader || !secret) return false;

  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");

    const expectedBuf = Buffer.from(expected, "hex");
    const receivedBuf = Buffer.from(signatureHeader, "hex");

    // Lengths must match before timingSafeEqual — differing lengths would throw.
    if (expectedBuf.length !== receivedBuf.length) return false;

    // Use timing-safe comparison to prevent timing-oracle attacks.
    return crypto.timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    // Never let a verification error surface as an unhandled exception —
    // always fail closed (return false) rather than crashing.
    return false;
  }
}
