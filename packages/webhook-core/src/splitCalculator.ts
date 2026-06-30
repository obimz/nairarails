import type { Split } from "@nairarails/shared-types";

export interface SplitAllocation {
  party: string;
  account_number: string;
  bank_code: string;
  percentage: number;
  /** Calculated amount in kobo — guaranteed to sum back to amountKobo */
  amount_kobo: number;
}

/**
 * Calculate the kobo amount for each split party.
 *
 * The naïve approach of `Math.floor(amount * pct / 100)` for every party
 * silently discards kobo due to integer rounding. This function assigns
 * any rounding remainder to the party with the largest percentage, so
 * the sum of all allocations is always exactly `amountKobo`.
 *
 * Example: ₦1 (100 kobo) split 85/10/5
 *   Naïve floors: 85 + 10 + 5 = 100 ✓ (happens to work)
 * Example: 101 kobo split 85/10/5
 *   Naïve floors: 85 + 10 + 5 = 100 — drops 1 kobo silently
 *   This function: 86 + 10 + 5 = 101 ✓ (remainder assigned to 85% party)
 *
 * @param amountKobo  Total amount to split (must be a positive integer in kobo)
 * @param splits      Array of split definitions — percentages must sum to 100
 * @returns           Array of allocations in the same order as `splits`
 */
export function calculateSplits(
  amountKobo: number,
  splits: Split[]
): SplitAllocation[] {
  const allocations: SplitAllocation[] = splits.map((s) => ({
    party: s.party,
    account_number: s.account_number,
    bank_code: s.bank_code,
    percentage: s.percentage,
    amount_kobo: Math.floor((amountKobo * s.percentage) / 100),
  }));

  // Compute the rounding remainder and give it to the largest-percentage party.
  const distributed = allocations.reduce((sum, a) => sum + a.amount_kobo, 0);
  const remainder = amountKobo - distributed;

  if (remainder !== 0) {
    // Find the party with the highest percentage — this is who absorbs rounding.
    let maxIdx = 0;
    for (let i = 1; i < allocations.length; i++) {
      const current = allocations[i];
      const max = allocations[maxIdx];
      if (current !== undefined && max !== undefined && current.percentage > max.percentage) {
        maxIdx = i;
      }
    }

    const target = allocations[maxIdx];
    if (target !== undefined) {
      target.amount_kobo += remainder;
    }
  }

  return allocations;
}
