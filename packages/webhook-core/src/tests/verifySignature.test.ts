import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { verifyNombaWebhook, type NombaSignatureFields } from "../verifySignature.js";

const SECRET = "NombaHackathon2026";

// Canonical test fields — matches the real payload shape
const FIELDS: NombaSignatureFields = {
  event_type:    "payment_success",
  requestId:     "req-uuid-abc-123",
  userId:        "user_001",
  walletId:      "wallet_001",
  transactionId: "txn_abc123",
  type:          "vact_transfer",
  time:          "2026-06-30T09:00:00Z",
  responseCode:  "00",
  timestamp:     "2026-06-30T09:00:01Z",
};

/**
 * Reproduce the exact algorithm so tests generate known-good signatures.
 * This mirrors verifyNombaWebhook internally — if the function changes,
 * this helper must change too, and the test will catch the mismatch.
 */
function makeSignature(fields: NombaSignatureFields, secret: string): string {
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

  return crypto.createHmac("sha256", secret).update(payload).digest("base64");
}

describe("verifyNombaWebhook — colon-joined fields + base64 algorithm", () => {
  it("accepts a valid signature", () => {
    const sig = makeSignature(FIELDS, SECRET);
    expect(verifyNombaWebhook(FIELDS, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered field (different transactionId)", () => {
    const sig = makeSignature(FIELDS, SECRET);
    const tampered: NombaSignatureFields = { ...FIELDS, transactionId: "txn_FORGED" };
    expect(verifyNombaWebhook(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects a tampered timestamp", () => {
    const sig = makeSignature(FIELDS, SECRET);
    const tampered: NombaSignatureFields = { ...FIELDS, timestamp: "2099-01-01T00:00:00Z" };
    expect(verifyNombaWebhook(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = makeSignature(FIELDS, "wrong_secret");
    expect(verifyNombaWebhook(FIELDS, sig, SECRET)).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyNombaWebhook(FIELDS, "", SECRET)).toBe(false);
  });

  it("rejects when secret is empty", () => {
    const sig = makeSignature(FIELDS, SECRET);
    expect(verifyNombaWebhook(FIELDS, sig, "")).toBe(false);
  });

  it("handles a missing responseCode by treating it as empty string", () => {
    const fieldsNoCode: NombaSignatureFields = { ...FIELDS, responseCode: "" };
    const sig = makeSignature(fieldsNoCode, SECRET);
    expect(verifyNombaWebhook(fieldsNoCode, sig, SECRET)).toBe(true);
  });
});
