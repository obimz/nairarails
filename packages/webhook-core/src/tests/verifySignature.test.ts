import crypto from "crypto";
import { describe, it, expect } from "vitest";
import { verifyNombaWebhook } from "../verifySignature.js";

const SECRET = "whsec_test_secret_nairarails";
const PAYLOAD = Buffer.from(
  JSON.stringify({
    event_type: "virtual_account.funded",
    requestId: "req_abc123",
    data: { transaction: { transactionAmount: 50000 } },
  })
);

function makeSignature(body: Buffer, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyNombaWebhook", () => {
  it("accepts a valid signature", () => {
    const sig = makeSignature(PAYLOAD, SECRET);
    expect(verifyNombaWebhook(PAYLOAD, sig, SECRET)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const sig = makeSignature(PAYLOAD, SECRET);
    const tampered = Buffer.from(PAYLOAD.toString() + " ");
    expect(verifyNombaWebhook(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const sig = makeSignature(PAYLOAD, "wrong_secret");
    expect(verifyNombaWebhook(PAYLOAD, sig, SECRET)).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyNombaWebhook(PAYLOAD, "", SECRET)).toBe(false);
  });

  it("rejects when secret is empty", () => {
    const sig = makeSignature(PAYLOAD, SECRET);
    expect(verifyNombaWebhook(PAYLOAD, sig, "")).toBe(false);
  });

  it("works with a string body (not just Buffer)", () => {
    const body = PAYLOAD.toString();
    const sig = makeSignature(Buffer.from(body), SECRET);
    expect(verifyNombaWebhook(body, sig, SECRET)).toBe(true);
  });
});
