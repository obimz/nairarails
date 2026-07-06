// apps/api/src/scripts/seed.ts
// Demo seed data — Phase 11.
// Inserts 5 orders across all statuses so the dashboard is never empty during a demo.
// Also seeds splits and ledger entries so the reconciliation drawer looks complete.
//
// Run with:  npx tsx --env-file=../../.env src/scripts/seed.ts
// Safe to run multiple times — deletes existing DEMO-* rows first, then re-inserts.

import { prisma } from "../lib/prisma.js";

async function main() {
  console.log("── NairaRails Demo Seed ──\n");

  const seedMerchant = await prisma.merchant.upsert({
    where: { email: "demo@nairarails.dev" },
    update: {
      name: "Demo Marketplace",
      apiKeyHash: "c2457662dc55d20ab5397b0867a2beaff1be87af86e39dedd36cc2014bd545bf",
      apiKeyPrefix: "nrk_live_demo_seed_k",
      webhookUrl: null,
      emailVerified: true,
    },
    create: {
      name: "Demo Marketplace",
      email: "demo@nairarails.dev",
      apiKeyHash: "c2457662dc55d20ab5397b0867a2beaff1be87af86e39dedd36cc2014bd545bf",
      apiKeyPrefix: "nrk_live_demo_seed_k",
      webhookUrl: null,
      emailVerified: true,
    },
  });
  console.log(`✓ Seed merchant ready: ${seedMerchant.email} (${seedMerchant.id})`);

  // Clean up any existing DEMO-* rows so re-runs are idempotent
  const demoRefs = ["DEMO-001", "DEMO-002", "DEMO-003", "DEMO-004", "DEMO-005"];
  await prisma.ledgerEntry.deleteMany({ where: { orderRef: { in: demoRefs } } });
  await prisma.split.deleteMany({       where: { orderRef: { in: demoRefs } } });
  await prisma.order.deleteMany({       where: { orderRef: { in: demoRefs } } });
  console.log("✓ Cleared existing DEMO-* rows\n");

  // ── DEMO-001: Underpayment — buyer paid ₦48,000 of ₦50,000 ──────────────────
  await prisma.order.create({
    data: {
      orderRef:             "DEMO-001",
      merchantId:           seedMerchant.id,
      customerName:         "Chisom Traders",
      expectedAmountKobo:   BigInt(5000000),
      receivedAmountKobo:   BigInt(4800000),
      status:               "underpayment",
      virtualAccountNumber: "9900012345",
      bankName:             "Nombank MFB",
      bankCode:             "000026",
      senderName:           "Chisom Nwosu",
      senderAccountNumber:  "0000000000",
      senderBankCode:       "035",
      splits: {
        create: [
          { party: "seller",   accountNumber: "0000000000", bankCode: "035", percentage: 85, status: "blocked" },
          { party: "platform", accountNumber: "0000000000", bankCode: "035", percentage: 10, status: "blocked" },
          { party: "rider",    accountNumber: "0000000000", bankCode: "035", percentage: 5,  status: "blocked" },
        ],
      },
      ledgerEntries: {
        create: [
          {
            entryType:  "payment_received",
            amountKobo: BigInt(4800000),
            reference:  "txn_demo_001",
            narration:  "Payment underpayment: received 4800000 kobo, expected 5000000 kobo",
          },
        ],
      },
    },
  });
  console.log("✓ DEMO-001 [underpayment] Chisom Traders — ₦48,000 of ₦50,000");

  // ── DEMO-002: Overpayment — buyer paid ₦53,000 of ₦50,000, splits executed ──
  await prisma.order.create({
    data: {
      orderRef:             "DEMO-002",
      merchantId:           seedMerchant.id,
      customerName:         "Emeka Okafor",
      expectedAmountKobo:   BigInt(5000000),
      receivedAmountKobo:   BigInt(5300000),
      status:               "overpayment",
      virtualAccountNumber: "9900054321",
      bankName:             "Nombank MFB",
      bankCode:             "000026",
      senderName:           "Emeka Okafor",
      senderAccountNumber:  "0000000000",
      senderBankCode:       "035",
      splits: {
        create: [
          { party: "seller",   accountNumber: "0000000000", bankCode: "035", percentage: 85, status: "executed", amountKobo: BigInt(4250000), nombaTransferRef: "txf_demo002_seller" },
          { party: "platform", accountNumber: "0000000000", bankCode: "035", percentage: 10, status: "executed", amountKobo: BigInt(500000),  nombaTransferRef: "txf_demo002_platform" },
          { party: "rider",    accountNumber: "0000000000", bankCode: "035", percentage: 5,  status: "executed", amountKobo: BigInt(250000),  nombaTransferRef: "txf_demo002_rider" },
        ],
      },
      ledgerEntries: {
        create: [
          { entryType: "payment_received", amountKobo: BigInt(5300000),  reference: "txn_demo_002",          narration: "Payment overpayment: received 5300000 kobo, expected 5000000 kobo" },
          { entryType: "split_payout",     amountKobo: BigInt(-4250000), reference: "txf_demo002_seller",    narration: "Split to seller: 4250000 kobo (85%)" },
          { entryType: "split_payout",     amountKobo: BigInt(-500000),  reference: "txf_demo002_platform",  narration: "Split to platform: 500000 kobo (10%)" },
          { entryType: "split_payout",     amountKobo: BigInt(-250000),  reference: "txf_demo002_rider",     narration: "Split to rider: 250000 kobo (5%)" },
        ],
      },
    },
  });
  console.log("✓ DEMO-002 [overpayment]  Emeka Okafor   — ₦53,000 of ₦50,000, splits executed, excess ₦3,000 quarantined");

  // ── DEMO-003: Paid — exact match, fully settled ───────────────────────────────
  await prisma.order.create({
    data: {
      orderRef:             "DEMO-003",
      merchantId:           seedMerchant.id,
      customerName:         "Adaeze Foods",
      expectedAmountKobo:   BigInt(500000),
      receivedAmountKobo:   BigInt(500000),
      status:               "paid",
      virtualAccountNumber: "9900099999",
      bankName:             "Nombank MFB",
      bankCode:             "000026",
      senderName:           "Adaeze Okwu",
      senderAccountNumber:  "0000000000",
      senderBankCode:       "035",
      splits: {
        create: [
          { party: "seller",   accountNumber: "0000000000", bankCode: "035", percentage: 80, status: "executed", amountKobo: BigInt(400000), nombaTransferRef: "txf_demo003_seller" },
          { party: "platform", accountNumber: "0000000000", bankCode: "035", percentage: 20, status: "executed", amountKobo: BigInt(100000), nombaTransferRef: "txf_demo003_platform" },
        ],
      },
      ledgerEntries: {
        create: [
          { entryType: "payment_received", amountKobo: BigInt(500000),  reference: "txn_demo_003",         narration: "Payment paid: exact match" },
          { entryType: "split_payout",     amountKobo: BigInt(-400000), reference: "txf_demo003_seller",   narration: "Split to seller: 400000 kobo (80%)" },
          { entryType: "split_payout",     amountKobo: BigInt(-100000), reference: "txf_demo003_platform", narration: "Split to platform: 100000 kobo (20%)" },
        ],
      },
    },
  });
  console.log("✓ DEMO-003 [paid]         Adaeze Foods   — ₦5,000 exact, splits executed");

  // ── DEMO-004: Pending — awaiting payment ──────────────────────────────────────
  await prisma.order.create({
    data: {
      orderRef:             "DEMO-004",
      merchantId:           seedMerchant.id,
      customerName:         "Tunde Logistics",
      expectedAmountKobo:   BigInt(1500000),
      receivedAmountKobo:   null,
      status:               "pending",
      virtualAccountNumber: "9900077777",
      bankName:             "Nombank MFB",
      bankCode:             "000026",
      splits: {
        create: [
          { party: "seller",   accountNumber: "0000000000", bankCode: "035", percentage: 85, status: "pending" },
          { party: "platform", accountNumber: "0000000000", bankCode: "035", percentage: 10, status: "pending" },
          { party: "rider",    accountNumber: "0000000000", bankCode: "035", percentage: 5,  status: "pending" },
        ],
      },
    },
  });
  console.log("✓ DEMO-004 [pending]      Tunde Logistics — ₦15,000 awaiting payment");

  // ── DEMO-005: Unmatched — payment arrived with no order ───────────────────────
  await prisma.order.create({
    data: {
      orderRef:             "DEMO-005",
      merchantId:           seedMerchant.id,
      customerName:         "Unknown",
      expectedAmountKobo:   BigInt(0),
      receivedAmountKobo:   BigInt(800000),
      status:               "unmatched",
      virtualAccountNumber: "9900088888",
      bankName:             "Nombank MFB",
      bankCode:             "000026",
      senderName:           "Unknown Sender",
      senderAccountNumber:  "0000000000",
      senderBankCode:       "058",
      ledgerEntries: {
        create: [
          { entryType: "payment_received", amountKobo: BigInt(800000), reference: "txn_demo_005", narration: "Unmatched payment — quarantined" },
        ],
      },
    },
  });
  console.log("✓ DEMO-005 [unmatched]    Unknown        — ₦8,000 quarantined");

  console.log("\n── Seed complete ───────────────────────────────────────");
  console.log("  Dashboard: 1 paid, 1 pending, 1 underpayment, 1 overpayment, 1 unmatched");
  console.log("  Exceptions queue: 3 items (DEMO-001, DEMO-002, DEMO-005)");
  console.log("  DEMO-002 overpayment has sender details — Refund Excess button will work\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\n✗ Seed failed:", err);
  await prisma.$disconnect();
  process.exit(1);
});
