// apps/api/src/scripts/seed.ts
// Demo seed data — Phase 11.
// Inserts 5 orders across all statuses so the dashboard is never empty during a demo,
// even if live webhook timing doesn't cooperate in front of judges.
//
// Run with: npx tsx src/scripts/seed.ts
// Safe to run multiple times — uses upsert so it won't create duplicates.

import "dotenv/config";
import { prisma } from "../lib/prisma.js";

const SEED_ORDERS = [
  {
    orderRef:            "DEMO-001",
    customerName:        "Chisom Traders",
    expectedAmountKobo:  BigInt(5000000),  // ₦50,000
    receivedAmountKobo:  BigInt(4800000),  // ₦48,000 — underpayment
    status:              "underpayment" as const,
    virtualAccountNumber: "9900012345",
    bankName:            "Nomba",
    bankCode:            "000026",
  },
  {
    orderRef:            "DEMO-002",
    customerName:        "Emeka Okafor",
    expectedAmountKobo:  BigInt(5000000),  // ₦50,000
    receivedAmountKobo:  BigInt(5300000),  // ₦53,000 — overpayment
    status:              "overpayment" as const,
    virtualAccountNumber: "9900054321",
    bankName:            "Nomba",
    bankCode:            "000026",
    senderAccountNumber: "0000000000",
    senderBankCode:      "035",           // Wema Bank
    senderName:          "Test Sender",
  },
  {
    orderRef:            "DEMO-003",
    customerName:        "Adaeze Foods",
    expectedAmountKobo:  BigInt(500000),  // ₦5,000
    receivedAmountKobo:  BigInt(500000),  // exact
    status:              "paid" as const,
    virtualAccountNumber: "9900099999",
    bankName:            "Nomba",
    bankCode:            "000026",
  },
  {
    orderRef:            "DEMO-004",
    customerName:        "Tunde Logistics",
    expectedAmountKobo:  BigInt(1500000), // ₦15,000
    receivedAmountKobo:  null,            // not yet paid
    status:              "pending" as const,
    virtualAccountNumber: "9900077777",
    bankName:            "Nomba",
    bankCode:            "000026",
  },
  {
    orderRef:            "DEMO-005",
    customerName:        "Ngozi Supplies",
    expectedAmountKobo:  BigInt(2000000), // ₦20,000
    receivedAmountKobo:  BigInt(500000),  // wrong amount — unmatched
    status:              "unmatched" as const,
    virtualAccountNumber: "9900088888",
    bankName:            "Nomba",
    bankCode:            "000026",
  },
] as const;

async function main() {
  console.log("── NairaRails Demo Seed ──");

  for (const order of SEED_ORDERS) {
    await prisma.order.upsert({
      where:  { orderRef: order.orderRef },
      update: order,
      create: order,
    });
    console.log(`✓ Upserted order ${order.orderRef} [${order.status}]`);
  }

  console.log("\nSeed complete — dashboard should now show varied demo data.");
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✗ Seed failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
