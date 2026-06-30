// apps/api/src/scripts/test-nomba.ts
// Manual Phase 4 verification script — NOT part of the demo flow, NOT committed as a route.
// Run with: npx tsx --env-file=../../.env src/scripts/test-nomba.ts
//
// Phase 4 checkpoint (both must pass before proceeding to Phase 5):
//   1. createVirtualAccount returns a real NUBAN
//   2. Send a test transfer to that NUBAN (Wema Bank 0000000000 per Training.md)
//      and confirm the webhook stub receives it
import { getAccessToken, createVirtualAccount } from "../integrations/nombaClient.js";

async function main() {
  console.log("── NairaRails Nomba Sandbox Test ──");

  const token = await getAccessToken();
  console.log("✓ Token:", token.slice(0, 20) + "...");

  const va = await createVirtualAccount({
    accountRef:          "test_" + Date.now(),
    accountName:         "NairaRails Test Order",
    expectedAmountKobo:  100000, // ₦1,000.00
  });

  console.log("✓ Virtual account created:");
  console.log("  NUBAN:    ", va.accountNumber);
  console.log("  Bank:     ", va.bankName, `(${va.bankCode})`);
  console.log("\nNext: send a test transfer to this NUBAN from Wema Bank 0000000000");
  console.log("Then check your webhook logs to confirm delivery.");
}

main().catch((err) => {
  console.error("✗ Test failed:", err);
  process.exit(1);
});
