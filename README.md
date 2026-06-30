# NairaRails 🛤️

> **Every naira has an address. Every settlement has a rule. Every exception is caught before it becomes a crisis.**

NairaRails is a programmable payment infrastructure layer for Nigerian marketplace commerce. It sits between businesses and the banking system — turning a single chaotic pool of incoming transfers into a fully traceable, automatically reconciled, intelligently routed money machine.

Built on Nomba's Virtual Account API for the Nomba x DevCareer Hackathon 2026.

---

## The Problem

Nigeria processed **₦1.07 quadrillion** in digital transactions in 2024.

The plumbing underneath that volume was not built for it.

A marketplace operator today receives payments into a single shared bank account. Every transfer shows a sender name and an amount — nothing else. A finance officer spends hours manually matching "Chidi Obi — ₦45,000" against 200 open orders. When the split goes to the seller, rider, and platform, it happens in a spreadsheet the next morning. When someone pays ₦48,000 instead of ₦50,000, the shortfall gets credited in full and quietly disappears. When NIBSS hiccupped in September 2024, ₦13.66 billion was posted without a corresponding debit — and nobody caught it at the application layer until Monday morning.

**₦35.56 billion** was lost to publicly documented reconciliation failures in Nigeria between 2023 and 2024.

NairaRails is the layer that should have been there.

---

## What NairaRails Does

NairaRails assigns every order on a marketplace its own **unique virtual account number** backed by a real Nigerian bank (via Nomba). The moment a buyer pays, a webhook fires and NairaRails takes over:

1. **Matches** the payment to the exact order — zero manual lookup
2. **Classifies** it: exact match, underpayment, or overpayment
3. **Routes** it instantly: seller's cut, platform fee, delivery rider — all split in the same settlement cycle
4. **Reports** it: the operator sees a live dashboard with every order's payment status, every exception, and every naira's current location

No spreadsheets. No batch jobs. No Monday morning surprises.

---

## Core Features

### 🏦 Per-Order Virtual Accounts
Every order gets a unique Nomba virtual account at creation. When payment arrives, the system already knows which order it belongs to — no human matching required.

### ⚡ Real-Time Webhook Reconciliation
Every incoming payment triggers an immediate classification:
- **Exact match** → mark paid, route funds, notify parties
- **Underpayment** → hold in partial receipt ledger, notify buyer of shortfall, block fulfilment until resolved
- **Overpayment** → mark paid, quarantine excess in a labelled wallet, alert ops with one-click refund action
- **Unmatched payment** → quarantine immediately, alert finance team — nothing disappears silently

### 💸 Instant Split-Settlement
Marketplace splits execute the moment payment settles — not in a batch job the next day. Configure any split at order creation:

```json
{
  "splits": [
    { "party": "seller",   "percentage": 85 },
    { "party": "platform", "percentage": 10 },
    { "party": "rider",    "percentage": 5  }
  ]
}
```

Each party receives their portion in the same settlement cycle. The seller sees their money within seconds of the buyer paying.

### 📊 Customer-Level Reporting Dashboard
Because every naira has a tagged virtual account and a purpose, NairaRails generates a live financial view automatically:
- Total expected vs received today
- Per-order payment status (paid / partial / pending / overpaid)
- Exception queue — every discrepancy with its current state and assigned action
- Settlement pipeline — funds in transit with expected arrival times
- Full immutable audit trail — every webhook event, every classification decision, every fund movement

### 🛡️ Hardened Webhook Engine
- HMAC signature verification on every event
- Idempotency keys — every payment processed exactly once
- Immediate 200 acknowledgement + async processing queue
- Dead-letter queue with retry logic for failed events
- Immutable event log — your evidence in any dispute

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Marketplace App                    │
│         (order creation → payment request)          │
└──────────────────────┬──────────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────────┐
│                    NairaRails API                    │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  VA Engine  │  │ Webhook      │  │  Rules     │ │
│  │  (Nomba VA  │  │ Processor    │  │  Engine    │ │
│  │   API)      │  │ (HMAC +      │  │  (splits,  │ │
│  │             │  │  idempotency)│  │  escrow,   │ │
│  └──────┬──────┘  └──────┬───────┘  │  thresholds│ │
│         │                │          └─────┬──────┘ │
│  ┌──────▼────────────────▼───────────────▼──────┐  │
│  │           Double-Entry Ledger (PostgreSQL)    │  │
│  │   Every credit must have a matching debit     │  │
│  │   before it posts — dry-posting caught here   │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │                           │
│  ┌──────────────────────▼───────────────────────┐  │
│  │         Reconciliation & Routing Layer        │  │
│  │  classify → route via Nomba Transfers API     │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │                           │
│  ┌──────────────────────▼───────────────────────┐  │
│  │           Reporting & Dashboard Layer         │  │
│  │   React dashboard — live, per-customer view   │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                          │
        ┌─────────────────▼──────────────────┐
        │          Nomba API Stack            │
        │  Virtual Account API               │
        │  Transfers API                     │
        │  Webhooks                          │
        │  Transactions API                  │
        └────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | FastAPI (Python) |
| Database | PostgreSQL (double-entry ledger, ACID transactions) |
| Queue / Async | Redis + background workers |
| Frontend Dashboard | React |
| Payment Infrastructure | Nomba Virtual Account API, Transfers API, Webhooks, Transactions API |
| Auth | JWT + HMAC webhook signature verification |

---

## API Reference

### Create a Virtual Account for an Order
```http
POST /api/v1/virtual-accounts
```
```json
{
  "order_id": "ORD-9821",
  "customer_name": "Chisom Traders",
  "expected_amount": 50000,
  "currency": "NGN",
  "expires_at": "2026-07-18T23:59:59Z",
  "splits": [
    { "party": "seller",   "account": "0123456789", "bank_code": "058", "percentage": 85 },
    { "party": "platform", "account": "9876543210", "bank_code": "058", "percentage": 10 },
    { "party": "rider",    "account": "1122334455", "bank_code": "044", "percentage": 5  }
  ]
}
```

**Response:**
```json
{
  "virtual_account_number": "7810293847",
  "bank_name": "GTBank",
  "bank_code": "058",
  "account_name": "NairaRails / Chisom Traders",
  "order_id": "ORD-9821",
  "expected_amount": 50000,
  "status": "pending",
  "expires_at": "2026-07-18T23:59:59Z"
}
```

### Webhook Event (Nomba → NairaRails)
```json
{
  "event": "transfer.success",
  "data": {
    "account_number": "7810293847",
    "amount": 48000,
    "reference": "NMB-TXN-001923",
    "sender_name": "Emeka Okafor",
    "timestamp": "2026-06-27T14:32:11Z"
  }
}
```

**NairaRails reconciliation response (internal):**
```json
{
  "order_id": "ORD-9821",
  "expected": 50000,
  "received": 48000,
  "status": "underpayment",
  "shortfall": 2000,
  "action": "hold_and_notify",
  "ledger_entry_id": "LED-00412"
}
```

### Get Order Reconciliation Status
```http
GET /api/v1/orders/{order_id}/reconciliation
```
```json
{
  "order_id": "ORD-9821",
  "virtual_account": "7810293847",
  "expected_amount": 50000,
  "received_amount": 48000,
  "status": "underpayment",
  "shortfall": 2000,
  "splits_executed": false,
  "exception_raised_at": "2026-06-27T14:32:12Z",
  "audit_trail": [
    { "event": "va_created",       "timestamp": "2026-06-27T09:00:00Z" },
    { "event": "payment_received", "amount": 48000, "timestamp": "2026-06-27T14:32:11Z" },
    { "event": "classified",       "status": "underpayment", "timestamp": "2026-06-27T14:32:11Z" },
    { "event": "notification_sent","parties": ["buyer"], "timestamp": "2026-06-27T14:32:12Z" }
  ]
}
```

---

## Reconciliation Logic

```python
async def reconcile_and_route(event: WebhookEvent) -> ReconciliationResult:
    # Idempotency check — process each event exactly once
    if await ledger.event_exists(event.reference):
        return ReconciliationResult(status="duplicate", action="ignored")

    order = await db.orders.find_by_va(event.account_number)

    if not order:
        await quarantine_funds(event)
        await alert_finance_team("unmatched_payment", event)
        return ReconciliationResult(status="unmatched", action="quarantined")

    diff = event.amount - order.expected_amount

    if diff == 0:
        await ledger.post(order, event, status="paid")
        await execute_splits(order, event.amount)
        await notify(order, status="paid")

    elif diff < 0:
        await ledger.post(order, event, status="underpayment")
        await notify_buyer(order, shortfall=abs(diff))
        await hold_pending_fulfilment(order)

    elif diff > 0:
        await ledger.post(order, event, status="overpayment")
        await execute_splits(order, order.expected_amount)
        await quarantine_excess(order, excess=diff)
        await alert_ops_team(order, excess=diff)

    return ReconciliationResult(status=order.status, ledger_id=order.ledger_entry_id)
```

---

## Demo Scenario

**A buyer orders food on a NairaRails-powered delivery marketplace.**

1. Order created → NairaRails issues a unique virtual account `7810293847` at GTBank
2. Buyer transfers ₦5,000 to that account number
3. Payment settles → Nomba fires `transfer.success` webhook
4. NairaRails classifies: **exact match**
5. Transfers API fires simultaneously:
   - ₦4,250 → Restaurant's account (85%)
   - ₦500 → Platform wallet (10%)
   - ₦250 → Rider's account (5%)
6. All three parties receive confirmation within seconds
7. Dashboard updates in real time — order marked paid, splits logged, audit trail complete

**Total human intervention required: zero.**

---

## Project Structure

```
nairarails/
├── api/
│   ├── main.py                  # FastAPI app entry point
│   ├── routers/
│   │   ├── virtual_accounts.py  # VA creation and management
│   │   ├── webhooks.py          # Nomba webhook handler
│   │   ├── reconciliation.py    # Classification and routing logic
│   │   └── reporting.py         # Dashboard data endpoints
│   └── middleware/
│       └── hmac_verify.py       # Webhook signature verification
├── core/
│   ├── ledger.py                # Double-entry ledger logic
│   ├── reconciler.py            # Exact / under / over / unmatched engine
│   ├── splitter.py              # Split-settlement execution
│   └── notifier.py              # Event notifications
├── integrations/
│   └── nomba/
│       ├── client.py            # Nomba API client
│       ├── virtual_accounts.py  # VA API calls
│       └── transfers.py         # Transfers API calls
├── models/
│   ├── order.py
│   ├── virtual_account.py
│   ├── ledger_entry.py
│   └── webhook_event.py
├── dashboard/                   # React frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Overview.jsx     # Live inflows vs expected
│   │   │   ├── Orders.jsx       # Per-order reconciliation status
│   │   │   └── Exceptions.jsx   # Underpayments, overpayments, unmatched
│   │   └── components/
├── tests/
│   ├── test_reconciler.py       # All 5 payment states tested
│   ├── test_webhook.py          # HMAC verification, idempotency
│   └── test_splits.py           # Split execution accuracy
├── .env.example
├── docker-compose.yml
└── README.md
```

---

## Environment Setup

```bash
# Clone and install
git clone https://github.com/your-team/nairarails.git
cd nairarails
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Add your Nomba sandbox API keys to .env

# Start services
docker-compose up -d  # PostgreSQL + Redis

# Run the API
uvicorn api.main:app --reload --port 8000

# Run the dashboard
cd dashboard && npm install && npm run dev
```

**Required environment variables:**
```env
NOMBA_API_KEY=your_nomba_api_key
NOMBA_SECRET_KEY=your_nomba_secret_key
NOMBA_WEBHOOK_SECRET=your_webhook_hmac_secret
NOMBA_BASE_URL=https://api.nomba.com/v1
DATABASE_URL=postgresql://user:pass@localhost:5432/nairarails
REDIS_URL=redis://localhost:6379
```

---

## Why NairaRails Wins on the Judging Criteria

| Judging Criterion | NairaRails Response |
|---|---|
| **Reconciliation logic quality** | Double-entry ledger, per-VA matching, every payment state handled explicitly — exact, under, over, unmatched, duplicate |
| **Underpayment & overpayment handling** | Underpayments held and buyer notified; overpayments quarantined with one-click ops refund — nothing absorbed silently |
| **Customer-level reporting clarity** | Live dashboard with per-order status, exception queue, settlement pipeline, and full immutable audit trail |

---

## The Insight

Nigeria processes a quadrillion naira digitally every year through infrastructure that still reconciles in spreadsheets. NairaRails doesn't fix the apps. It fixes the plumbing the apps run on.

Every naira deserves an address. Every settlement deserves a rule. Every exception deserves to be caught before it becomes a crisis.

That's NairaRails.

---

## Team

Built for the **Nomba x DevCareer Hackathon 2026** — Infrastructure Track.

---

*NairaRails — programmable payment infrastructure for Nigeria's next growth wave.*  