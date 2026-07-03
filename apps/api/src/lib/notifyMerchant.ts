/**
 * notifyMerchant — fire-and-forget outbound webhook delivery.
 *
 * Posts a `payment.classified` event to the merchant's registered webhookUrl
 * whenever NairaRails finishes classifying a payment. This is what makes
 * NairaRails feel like a platform: the marketplace backend receives a push
 * notification rather than having to poll for order status.
 *
 * Design rules:
 *  1. Never throws — a failed delivery must never crash the inbound webhook
 *     handler or delay the 200 back to Nomba.
 *  2. Fire-and-forget — call this without await (or void the promise) so it
 *     doesn't block the response path.
 *  3. 5-second hard timeout — prevent a slow merchant endpoint from tying up
 *     the Node process.
 *  4. Errors are logged, not rethrown — observable in logs, retriable manually,
 *     but never fatal.
 */

import type { Merchant } from "@prisma/client";
import type { MerchantWebhookPayload } from "@nairarails/shared-types";
import { logger } from "./logger.js";

export async function notifyMerchant(
  merchant: Merchant,
  payload: MerchantWebhookPayload
): Promise<void> {
  // Skip silently if the merchant hasn't registered a webhook URL.
  if (!merchant.webhookUrl) return;

  try {
    const response = await fetch(merchant.webhookUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(5000), // 5s hard timeout
    });

    if (!response.ok) {
      logger.warn(
        {
          merchantId:  merchant.id,
          webhookUrl:  merchant.webhookUrl,
          statusCode:  response.status,
          order_ref:   payload.order_ref,
        },
        "[notifyMerchant] delivery received non-2xx response"
      );
    } else {
      logger.info(
        {
          merchantId: merchant.id,
          order_ref:  payload.order_ref,
          status:     payload.status,
        },
        "[notifyMerchant] delivery succeeded"
      );
    }
  } catch (err) {
    // Covers: network errors, DNS failures, AbortSignal timeout, etc.
    // Log and move on — never propagate into the calling handler.
    logger.error(
      {
        merchantId: merchant.id,
        webhookUrl: merchant.webhookUrl,
        order_ref:  payload.order_ref,
        err,
      },
      "[notifyMerchant] delivery failed — logged, not rethrown"
    );
  }
}
