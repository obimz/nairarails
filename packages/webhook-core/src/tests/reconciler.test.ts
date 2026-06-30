import { describe, it, expect } from "vitest";
import { classify, shortfallKobo, excessKobo } from "../reconciler.js";

describe("classify", () => {
  it('returns "paid" for an exact match', () => {
    expect(classify(50000, 50000)).toBe("paid");
  });

  it('returns "underpayment" when received is less than expected', () => {
    expect(classify(50000, 48000)).toBe("underpayment");
  });

  it('returns "overpayment" when received is more than expected', () => {
    expect(classify(50000, 53000)).toBe("overpayment");
  });

  it('returns "unmatched" when received is 0', () => {
    expect(classify(50000, 0)).toBe("unmatched");
  });

  it('returns "paid" when both expected and received are 0', () => {
    // Edge case: a zero-amount order that received zero — treat as paid (no debt).
    expect(classify(0, 0)).toBe("paid");
  });

  it('returns "underpayment" for a 1-kobo shortfall (boundary)', () => {
    expect(classify(100, 99)).toBe("underpayment");
  });

  it('returns "overpayment" for a 1-kobo excess (boundary)', () => {
    expect(classify(100, 101)).toBe("overpayment");
  });
});

describe("shortfallKobo", () => {
  it("returns the difference for underpayments", () => {
    expect(shortfallKobo(50000, 48000)).toBe(2000);
  });

  it("returns 0 for exact payment", () => {
    expect(shortfallKobo(50000, 50000)).toBe(0);
  });

  it("returns 0 for overpayment (no shortfall)", () => {
    expect(shortfallKobo(50000, 53000)).toBe(0);
  });
});

describe("excessKobo", () => {
  it("returns the excess for overpayments", () => {
    expect(excessKobo(50000, 53000)).toBe(3000);
  });

  it("returns 0 for exact payment", () => {
    expect(excessKobo(50000, 50000)).toBe(0);
  });

  it("returns 0 for underpayment (no excess)", () => {
    expect(excessKobo(50000, 48000)).toBe(0);
  });
});
