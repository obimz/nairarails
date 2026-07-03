// hardening-test.mjs — Phase 10 webhook hardening verification
// Run with: node --env-file=.env hardening-test.mjs
import http from "http";
import crypto from "crypto";

const SECRET    = process.env.NOMBA_WEBHOOK_SECRET ?? "NombaHackathon2026";
const TIMESTAMP = "2026-06-30T18:00:00Z";

const PAYLOAD = {
  requestId:  "harden-test-001",
  event_type: "payment_success",
  data: {
    transaction: {
      transactionId:          "txn_harden_001",
      type:                   "vact_transfer",
      transactionAmount:      500000,
      time:                   "2026-06-30T18:00:00Z",
      responseCode:           "00",
      aliasAccountReference:  "ord-999-nonexistent",
    },
    merchant:  { userId: "user_001", walletId: "wallet_001" },
    customer:  { senderName: "Test Sender", accountNumber: "0000000000", bankCode: "035" },
  },
};

// ── Build valid signature ──────────────────────────────────────────────────────
function makeSignature(payload, timestamp, secret) {
  const t = payload.data.transaction;
  const hashInput = [
    payload.event_type,
    payload.requestId,
    payload.data.merchant.userId,
    payload.data.merchant.walletId,
    t.transactionId,
    t.type,
    t.time,
    t.responseCode,
    timestamp,
  ].join(":");
  return crypto.createHmac("sha256", secret).update(hashInput).digest("base64");
}

// ── HTTP helper ────────────────────────────────────────────────────────────────
function post(body, signature, timestamp) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "localhost",
        port:     3000,
        path:     "/api/v1/webhooks/nomba",
        method:   "POST",
        headers:  {
          "Content-Type":    "application/json",
          "Content-Length":  Buffer.byteLength(data),
          "nomba-signature": signature,
          "nomba-timestamp": timestamp,
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => { buf += c; });
        res.on("end",  () => resolve({ status: res.statusCode, body: buf }));
      }
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────
async function run() {
  console.log("\n── Phase 10: Webhook Hardening Tests ─────────────────────\n");

  // ① Bad signature → must return 401
  const bad = await post(PAYLOAD, "THISISATAMPEREDSIGNATURE", TIMESTAMP);
  const test1 = bad.status === 401;
  console.log(`[${test1 ? "✓ PASS" : "✗ FAIL"}] Tampered signature rejected → HTTP ${bad.status}`);
  if (!test1) console.log("         Expected 401, got:", bad.status, bad.body);

  // ② Valid signature → must return 200
  const validSig = makeSignature(PAYLOAD, TIMESTAMP, SECRET);
  const good = await post(PAYLOAD, validSig, TIMESTAMP);
  const test2 = good.status === 200;
  console.log(`[${test2 ? "✓ PASS" : "✗ FAIL"}] Valid signature accepted   → HTTP ${good.status} ${good.body.slice(0, 80)}`);

  // ③ Same requestId again → must return 200 with duplicate_ignored
  const dup = await post(PAYLOAD, validSig, TIMESTAMP);
  const dupBody = JSON.parse(dup.body);
  const test3 = dup.status === 200 && dupBody.status === "duplicate_ignored";
  console.log(`[${test3 ? "✓ PASS" : "✗ FAIL"}] Duplicate requestId ignored → HTTP ${dup.status} status="${dupBody.status}"`);

  // ④ Wrong shape → must return 200 with ignored
  const garbage = await post({ garbage: true }, "anysig", TIMESTAMP);
  const gbBody = JSON.parse(garbage.body);
  const test4 = garbage.status === 200 && gbBody.reason === "unrecognised_shape";
  console.log(`[${test4 ? "✓ PASS" : "✗ FAIL"}] Malformed payload ignored  → HTTP ${garbage.status} reason="${gbBody.reason}"`);

  console.log("\n──────────────────────────────────────────────────────────");
  const passed = [test1, test2, test3, test4].filter(Boolean).length;
  console.log(`  ${passed}/4 tests passed\n`);
  process.exit(passed === 4 ? 0 : 1);
}

run().catch((err) => { console.error(err); process.exit(1); });
