import { describe, it, expect } from "vitest";
import { calculateSplits } from "../splitCalculator.js";
import type { Split } from "@nairarails/shared-types";

const SPLITS_85_10_5: Split[] = [
  { party: "seller",   account_number: "0123456789", bank_code: "044", percentage: 85 },
  { party: "platform", account_number: "9876543210", bank_code: "058", percentage: 10 },
  { party: "rider",    account_number: "1111111111", bank_code: "033", percentage: 5  },
];

const SPLITS_50_50: Split[] = [
  { party: "a", account_number: "0000000001", bank_code: "044", percentage: 50 },
  { party: "b", account_number: "0000000002", bank_code: "044", percentage: 50 },
];

describe("calculateSplits", () => {
  it("sums back to the original amount for a clean division (100 kobo, 85/10/5)", () => {
    const result = calculateSplits(100, SPLITS_85_10_5);
    const total = result.reduce((s, a) => s + a.amount_kobo, 0);
    expect(total).toBe(100);
  });

  it("sums back to the original amount when percentages don't divide evenly (101 kobo, 85/10/5)", () => {
    const result = calculateSplits(101, SPLITS_85_10_5);
    const total = result.reduce((s, a) => s + a.amount_kobo, 0);
    expect(total).toBe(101);
  });

  it("assigns the rounding remainder to the largest-percentage party", () => {
    // 101 kobo: floor(101*85/100)=85, floor(101*10/100)=10, floor(101*5/100)=5 → sum=100, remainder=1
    // Remainder should go to the 85% party → seller gets 86
    const result = calculateSplits(101, SPLITS_85_10_5);
    const seller = result.find((a) => a.party === "seller");
    expect(seller?.amount_kobo).toBe(86);
  });

  it("sums back for an odd amount with 50/50 split (odd kobo)", () => {
    // 99 kobo: floor(99*50/100)=49 each → sum=98, remainder=1 → one party gets 50
    const result = calculateSplits(99, SPLITS_50_50);
    const total = result.reduce((s, a) => s + a.amount_kobo, 0);
    expect(total).toBe(99);
  });

  it("preserves party metadata on each allocation", () => {
    const result = calculateSplits(10000, SPLITS_85_10_5);
    const seller = result.find((a) => a.party === "seller");
    expect(seller?.account_number).toBe("0123456789");
    expect(seller?.bank_code).toBe("044");
    expect(seller?.percentage).toBe(85);
  });

  it("handles a single-party 100% split", () => {
    const single: Split[] = [
      { party: "solo", account_number: "5555555555", bank_code: "011", percentage: 100 },
    ];
    const result = calculateSplits(50000, single);
    expect(result[0]?.amount_kobo).toBe(50000);
  });

  it("sums back to 1 kobo (minimum meaningful amount)", () => {
    const result = calculateSplits(1, SPLITS_85_10_5);
    const total = result.reduce((s, a) => s + a.amount_kobo, 0);
    expect(total).toBe(1);
  });
});
