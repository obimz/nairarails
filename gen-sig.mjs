import crypto from "crypto";

// Edit these values to match whatever payload you're sending in Thunder Client
const SECRET    = "NombaHackathon2026";
const TIMESTAMP = "2026-06-30T18:00:00Z"; // must match nomba-timestamp header exactly

const fields = {
  event_type:    "payment_success",
  requestId:     "test-req-001",
  userId:        "user_001",
  walletId:      "wallet_001",
  transactionId: "txn_001",
  type:          "vact_transfer",
  time:          "2026-06-30T18:00:00Z", // must match data.transaction.time in body
  responseCode:  "00",
  timestamp:     TIMESTAMP,
};

const payload = [
  fields.event_type,
  fields.requestId,
  fields.userId,
  fields.walletId,
  fields.transactionId,
  fields.type,
  fields.time,
  fields.responseCode,
  fields.timestamp,
].join(":");

const signature = crypto
  .createHmac("sha256", SECRET)
  .update(payload)
  .digest("base64");

console.log("\nnomba-signature header value:");
console.log(signature);
console.log("\nnomba-timestamp header value:");
console.log(TIMESTAMP);
