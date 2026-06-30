/**
 * Payment classification — pure function, zero side effects.
 *
 * All amounts MUST be in kobo (whole integers). Never pass naira floats here.
 * The classifier is the source of truth for what goes into `orders.status`
 * and what gets written to the `ledger_entries` table.
 */

export type PaymentClassification =
  | "paid"
  | "underpayment"
  | "overpayment"
  | "unmatched";

/**
 * Classify an inbound payment against its expected amount.
 *
 * @param expectedKobo  The amount the order was created with (kobo)
 * @param receivedKobo  The amount the virtual account actually received (kobo)
 * @returns             The classification result
 */
export function classify(
  expectedKobo: number,
  receivedKobo: number
): PaymentClassification {
  // Guard: a received amount of 0 with a positive expectation is unmatched —
  // it likely means a webhook fired before any funds arrived, which can happen
  // due to timing or a misconfigured event type.
  if (receivedKobo === 0 && expectedKobo > 0) return "unmatched";

  if (receivedKobo === expectedKobo) return "paid";
  if (receivedKobo < expectedKobo) return "underpayment";
  return "overpayment";
}

/**
 * Calculate the shortfall (underpayment delta) in kobo.
 * Returns 0 if receivedKobo >= expectedKobo.
 */
export function shortfallKobo(expectedKobo: number, receivedKobo: number): number {
  return Math.max(0, expectedKobo - receivedKobo);
}

/**
 * Calculate the excess (overpayment delta) in kobo.
 * Returns 0 if receivedKobo <= expectedKobo.
 */
export function excessKobo(expectedKobo: number, receivedKobo: number): number {
  return Math.max(0, receivedKobo - expectedKobo);
}
