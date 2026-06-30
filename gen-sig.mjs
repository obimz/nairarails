// Run with: node --env-file=.env gen-sig.mjs
import crypto from "crypto";

const SECRET = process.env.NOMBA_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("NOMBA_WEBHOOK_SECRET not found — run with: node --env-file=.env gen-sig.mjs");
  process.exit(1);
}

// ── Edit these to match the Thunder Client payload you're sending ────────────
const TIMESTAMP     = "2026-06-30T18:00:00Z";
const EVENT_TYPE    = "payment_success";
const REQUEST_ID    = "test-req-001";
const USER_ID       = "user_001";
const WALLET_ID     = "wallet_001";
const TXN_ID        = "txn_001";
const TXN_TYPE      = "vact_transfer";
const TXN_TIME      = "2026-06-30T18:00:00Z";
const RESPONSE_CODE = "00";
// ─────────────────────────────────────────────────────────────────────────────

const hashPayload = [
  EVENT_TYPE,
  REQUEST_ID,
  USER_ID,
  WALLET_ID,
  TXN_ID,
  TXN_TYPE,
  TXN_TIME,
  RESPONSE_CODE,
  TIMESTAMP,
].join(":");

const signature = crypto
  .createHmac("sha256", SECRET)
  .update(hashPayload)
  .digest("base64");

console.log("\n── Thunder Client headers ──────────────────────────");
console.log("nomba-signature :", signature);
console.log("nomba-timestamp :", TIMESTAMP);
console.log("────────────────────────────────────────────────────");
console.log("Secret used     :", SECRET.slice(0, 6) + "...");
