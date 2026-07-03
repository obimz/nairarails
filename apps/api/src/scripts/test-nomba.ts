// apps/api/src/scripts/test-nomba.ts
//
// Phase 4 checkpoint script — manually verify all four Nomba client functions
// against the real sandbox before trusting any route that depends on them.
//
// Run with:
//   npx tsx --env-file=../../.env src/scripts/test-nomba.ts
//
// Phase 4 checkpoint (both must be true before proceeding to Phase 5):
//   1. createVirtualAccount returns a real NUBAN from Nomba sandbox
//   2. lookupBankAccount resolves the Wema test account (0000000000)
//
// After this script passes:
//   Send a real test transfer to the printed NUBAN from Wema Bank 0000000000
//   and confirm the webhook arrives at POST /api/v1/webhooks/nomba.

import {
  getAccessToken,
  createVirtualAccount,
  lookupBankAccount,
  transferToBank,
} from "../integrations/nombaClient.js";

const WEMA_BANK_CODE = "035";       // Wema Bank — Nomba sandbox test bank
const TEST_ACCOUNT   = "0000000000"; // Accepts any inbound transfer in sandbox

async function main() {
  console.log("── NairaRails Nomba Sandbox Test ──\n");

  // ── 1. Auth token ─────────────────────────────────────────────────────────
  console.log("1. Fetching access token...");
  const token = await getAccessToken();
  console.log(`   ✓ Token acquired: ${token.slice(0, 24)}...\n`);

  // ── 2. Create virtual account ─────────────────────────────────────────────
  const accountRef = `test_${Date.now()}`;
  console.log(`2. Creating virtual account (ref: ${accountRef})...`);
  const va = await createVirtualAccount({
    accountRef,
    accountName:        "NairaRails Test Order",
    expectedAmountKobo: 5000, // ₦50 — small sandbox amount
  });
  console.log(`   ✓ Virtual account created:`);
  console.log(`     NUBAN : ${va.accountNumber}`);
  console.log(`     Bank  : ${va.bankName} (${va.bankCode})\n`);

  // ── 3. Lookup bank account ────────────────────────────────────────────────
  console.log(`3. Looking up Wema test account ${TEST_ACCOUNT}...`);
  const lookup = await lookupBankAccount({
    bankCode:      WEMA_BANK_CODE,
    accountNumber: TEST_ACCOUNT,
  });
  console.log(`   ✓ Account resolved: "${lookup.accountName}"\n`);

  // ── 4. Optional transfer ──────────────────────────────────────────────────
  // Pass --with-transfer to actually send 50 kobo to the test account.
  // Skip if sandbox balance is empty or you only want to verify auth + VA.
  if (process.argv.includes("--with-transfer")) {
    const merchantTxRef = `test_transfer_${Date.now()}`;
    console.log(`4. Initiating test transfer (50 kobo → ${TEST_ACCOUNT}, ref: ${merchantTxRef})...`);
    const transfer = await transferToBank({
      amountKobo:    50,
      bankCode:      WEMA_BANK_CODE,
      accountNumber: TEST_ACCOUNT,
      accountName:   lookup.accountName,
      narration:     "NairaRails Phase 4 test",
      merchantTxRef,
    });
    console.log(`   ✓ Transfer initiated:`);
    console.log(`     Ref    : ${transfer.transferRef}`);
    console.log(`     Status : ${transfer.status}\n`);
  } else {
    console.log("4. Transfer skipped (pass --with-transfer to run)\n");
  }

  console.log("── Phase 4 checkpoint PASSED ──");
  console.log(`\nNext: send a test transfer to NUBAN ${va.accountNumber}`);
  console.log("from Wema Bank 0000000000 in the Nomba sandbox dashboard,");
  console.log("then watch POST /api/v1/webhooks/nomba for the incoming event.\n");
}

main().catch((err: unknown) => {
  console.error("\n✗ Test FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
