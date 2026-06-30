// apps/api/src/integrations/nombaClient.ts
// Nomba API client — Phase 4 implementation.
//
// All calls require:
//   Authorization: Bearer <access_token>   (from getAccessToken below)
//   accountId: process.env.NOMBA_ACCOUNT_ID
//   Content-Type: application/json
//
// Token lifecycle: valid 60 min, refresh at 55-min mark (per Training.md Module 03).
// Cache in module scope — do NOT request a fresh token per call.

import { logger } from "../lib/logger.js";

const BASE_URL = process.env["NOMBA_BASE_URL"] ?? "https://sandbox.api.nomba.com/v1";
const ACCOUNT_ID = process.env["NOMBA_ACCOUNT_ID"] ?? "";

// ─── Token cache ──────────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0; // unix ms

/**
 * Returns a valid access token, refreshing if within 5 minutes of expiry.
 * Phase 4: implement the POST /auth/token/issue call.
 */
export async function getAccessToken(): Promise<string> {
  // TODO (Phase 4): implement token fetch + 55-min cache
  // const now = Date.now();
  // if (cachedToken && now < tokenExpiresAt) return cachedToken;
  // const res = await fetch(`${BASE_URL}/auth/token/issue`, { ... });
  // const { data } = await res.json();
  // cachedToken = data.access_token;
  // tokenExpiresAt = now + 55 * 60 * 1000;
  // return cachedToken;
  logger.warn("getAccessToken() is a stub — Phase 4 not yet implemented");
  return "stub_token";
}

/**
 * Create a virtual account (NUBAN) for an order.
 * Phase 4: POST /accounts/virtual
 */
export async function createVirtualAccount(_params: {
  accountRef: string;
  accountName: string;
  expectedAmountKobo: number;
  expiryDate?: string;
}): Promise<{ accountNumber: string; bankName: string; bankCode: string }> {
  // TODO (Phase 4): implement
  logger.warn("createVirtualAccount() is a stub — Phase 4 not yet implemented");
  return { accountNumber: "0000000000", bankName: "Nomba", bankCode: "000026" };
}

/**
 * Look up a bank account name before initiating a transfer.
 * Phase 4: POST /transfers/bank/lookup
 * REQUIRED before every transferToBank call — never skip.
 */
export async function lookupBankAccount(_params: {
  bankCode: string;
  accountNumber: string;
}): Promise<{ accountName: string }> {
  // TODO (Phase 4): implement
  logger.warn("lookupBankAccount() is a stub — Phase 4 not yet implemented");
  return { accountName: "STUB ACCOUNT NAME" };
}

/**
 * Transfer funds to a Nigerian bank account.
 * Phase 4: POST /transfers/bank
 * Always call lookupBankAccount first and pass the resolved accountName.
 */
export async function transferToBank(_params: {
  amountKobo: number;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration: string;
  merchantTxRef: string;
}): Promise<{ transferRef: string; status: string }> {
  // TODO (Phase 4): implement
  logger.warn("transferToBank() is a stub — Phase 4 not yet implemented");
  return { transferRef: "STUB-TXN-" + Date.now(), status: "pending" };
}
