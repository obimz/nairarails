/**
 * money.ts — kobo ↔ naira conversion and formatting helpers.
 *
 * Rule: all amounts are stored and transmitted in kobo (integer).
 * These helpers are the ONLY place a kobo value should become a naira float
 * or a display string — never divide by 100 anywhere else in the codebase.
 *
 * ₦1.00 = 100 kobo
 */

const NAIRA_FORMATTER = new Intl.NumberFormat("en-NG", {
  style:                 "currency",
  currency:              "NGN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COMPACT_FORMATTER = new Intl.NumberFormat("en-NG", {
  style:                 "currency",
  currency:              "NGN",
  notation:              "compact",
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/**
 * Convert an integer kobo amount to a naira float.
 *
 * @example koboToNaira(500000) // → 5000.00
 */
export function koboToNaira(kobo: number): number {
  return kobo / 100;
}

/**
 * Format a kobo integer as a full naira currency string.
 *
 * @example formatNaira(500000) // → "₦5,000.00"
 */
export function formatNaira(kobo: number): string {
  return NAIRA_FORMATTER.format(koboToNaira(kobo));
}

/**
 * Format a kobo integer as a compact naira string (useful in stat cards).
 *
 * @example formatNairaCompact(5000000) // → "₦50K"
 */
export function formatNairaCompact(kobo: number): string {
  return COMPACT_FORMATTER.format(koboToNaira(kobo));
}

/**
 * Returns a sign-prefixed formatted string for ledger deltas.
 *
 * @example formatNairaDelta(200000)  // → "+₦2,000.00"
 * @example formatNairaDelta(-200000) // → "-₦2,000.00"
 */
export function formatNairaDelta(kobo: number): string {
  const prefix = kobo >= 0 ? "+" : "";
  return `${prefix}${formatNaira(Math.abs(kobo))}`;
}
