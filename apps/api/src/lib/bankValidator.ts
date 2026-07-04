/**
 * bankValidator.ts
 *
 * Validates bank codes against Nomba's supported bank list (fetched 2026-07-04,
 * 625 banks). This catches invalid bank codes at order creation time — before a
 * VA is provisioned and before any transfer is attempted — so merchants get a
 * clear 422 instead of a cryptic Nomba error at settlement.
 *
 * The JSON is loaded once at module init (sync import). Refresh by re-running
 * the admin /banks endpoint and replacing apps/api/src/lib/banks.json.
 */

import { createRequire } from "module";

const require = createRequire(import.meta.url);
const bankList = require("./banks.json") as { name: string; code: string }[];

// Build a lookup map: code → name (trimmed)
const bankMap = new Map<string, string>(
  bankList.map((b) => [b.code.trim(), b.name.trim()])
);

/**
 * Returns true if the bank code exists in Nomba's supported bank list.
 */
export function isValidBankCode(code: string): boolean {
  return bankMap.has(code.trim());
}

/**
 * Returns the bank name for a code, or null if not found.
 */
export function getBankName(code: string): string | null {
  return bankMap.get(code.trim()) ?? null;
}

/**
 * Validates all split bank codes in one pass.
 * Returns an array of error messages — empty array means all valid.
 */
export function validateSplitBankCodes(
  splits: { party: string; bank_code: string; account_number: string }[]
): string[] {
  const errors: string[] = [];
  for (const split of splits) {
    if (!isValidBankCode(split.bank_code)) {
      errors.push(
        `Split party '${split.party}': bank code '${split.bank_code}' is not supported by Nomba. ` +
        `Check GET /api/v1/admin/banks for the full list.`
      );
    }
  }
  return errors;
}
