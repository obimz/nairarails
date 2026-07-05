# Orders

An order represents a single buyer transaction on your marketplace. Each order gets its own unique bank account number — when the buyer pays that account, NairaRails automatically reconciles the payment against the order.

---

## Create an order

```http
POST /api/v1/orders
x-api-key: nrk_live_your_key
Content-Type: application/json
```

### Request body

| Field | Type | Required | Description |
|---|---|---|---|
| `order_ref` | string | ✓ | Your internal order ID. Must be unique per merchant. |
| `customer_name` | string | ✓ | The buyer's name. Used for account labelling. |
| `expected_amount_kobo` | integer | ✓ | Amount due in kobo (₦1 = 100 kobo). Must be a positive integer. |
| `currency` | string | ✓ | Must be `"NGN"`. |
| `splits` | array | ✓ | One entry per payment recipient. Percentages must sum to exactly 100. |

### Split object

| Field | Type | Required | Description |
|---|---|---|---|
| `party` | string | ✓ | A label for this recipient (e.g. `"seller"`, `"platform"`, `"rider"`). |
| `account_number` | string | ✓ | 10-digit NUBAN bank account number. |
| `bank_code` | string | ✓ | 3-digit CBN bank code (e.g. `"058"` for GTBank, `"044"` for Access). |
| `percentage` | integer | ✓ | Whole number 1–100. All split percentages for one order must sum to 100. |

### Example request

```json
{
  "order_ref": "ord-1001",
  "customer_name": "Emeka Okafor",
  "expected_amount_kobo": 500000,
  "currency": "NGN",
  "splits": [
    { "party": "seller",   "account_number": "0123456789", "bank_code": "058", "percentage": 85 },
    { "party": "platform", "account_number": "9876543210", "bank_code": "058", "percentage": 10 },
    { "party": "rider",    "account_number": "1122334455", "bank_code": "044", "percentage": 5  }
  ]
}
```

### Response `201`

```json
{
  "order_ref": "ord-1001",
  "virtual_account_number": "9900012345",
  "bank_name": "Nombank MFB",
  "expected_amount_kobo": 500000,
  "currency": "NGN",
  "status": "pending",
  "created_at": "2026-07-04T09:00:00Z"
}
```

Display `virtual_account_number` and `bank_name` to your buyer. They transfer the exact amount to that account.

---

## List orders

```http
GET /api/v1/orders
x-api-key: nrk_live_your_key
```

Optional query parameters:

| Parameter | Description |
|---|---|
| `status` | Filter by status: `pending`, `paid`, `underpayment`, `overpayment`, `unmatched`, `refunded` |
| `page` | Page number (default: 1) |
| `limit` | Results per page (default: 20, max: 100) |

### Response `200`

```json
{
  "results": [
    {
      "order_ref": "ord-1001",
      "status": "paid",
      "expected_amount_kobo": 500000,
      "received_amount_kobo": 500000,
      "created_at": "2026-07-04T09:00:00Z",
      "updated_at": "2026-07-04T09:14:22Z"
    }
  ],
  "total_count": 1
}
```

---

## Get reconciliation status

Returns the full payment detail for a single order, including split results and the complete audit trail.

```http
GET /api/v1/orders/:order_ref/reconciliation
x-api-key: nrk_live_your_key
```

### Response `200`

```json
{
  "order_ref": "ord-1001",
  "virtual_account_number": "9900012345",
  "expected_amount_kobo": 500000,
  "received_amount_kobo": 500000,
  "status": "paid",
  "shortfall_kobo": 0,
  "excess_kobo": 0,
  "splits_executed": true,
  "splits": [
    { "party": "seller",   "percentage": 85, "amount_paid_kobo": 425000, "status": "executed" },
    { "party": "platform", "percentage": 10, "amount_paid_kobo": 50000,  "status": "executed" },
    { "party": "rider",    "percentage": 5,  "amount_paid_kobo": 25000,  "status": "executed" }
  ],
  "audit_trail": [
    { "event": "order_created",    "timestamp": "2026-07-04T09:00:00Z" },
    { "event": "payment_received", "amount_kobo": 500000, "timestamp": "2026-07-04T09:14:20Z" },
    { "event": "classified",       "status": "paid",      "timestamp": "2026-07-04T09:14:20Z" },
    { "event": "split_executed",   "party": "seller",     "amount_kobo": 425000, "timestamp": "2026-07-04T09:14:21Z" },
    { "event": "split_executed",   "party": "platform",   "amount_kobo": 50000,  "timestamp": "2026-07-04T09:14:21Z" },
    { "event": "split_executed",   "party": "rider",      "amount_kobo": 25000,  "timestamp": "2026-07-04T09:14:22Z" }
  ]
}
```

---

## Order statuses

| Status | Meaning |
|---|---|
| `pending` | Virtual account created. Waiting for payment. |
| `paid` | Exact amount received. Splits executed. Order complete. |
| `underpayment` | Less than the expected amount was received. Splits are on hold. See [Exceptions](/docs/exceptions). |
| `overpayment` | More than the expected amount was received. Splits executed on expected amount only. Excess is held. See [Exceptions](/docs/exceptions). |
| `unmatched` | A payment arrived but could not be linked to a known order. Requires manual investigation. |
| `refunded` | A refund was issued (for underpayment or overpayment). Order is closed. |
| `expired` | The virtual account expired before any payment arrived. |

---

## Split execution rules

- Splits only execute on `paid` and `overpayment` orders.
- On `overpayment`, splits are calculated against the **expected** amount only. The excess is held separately and never distributed.
- On `underpayment`, no splits execute until the shortfall is resolved (or a refund is issued).
- Rounding: if the split percentages produce a fractional kobo, the remainder is assigned to the largest-percentage party. The total always equals the expected amount exactly — no kobo is lost.
- NairaRails verifies each recipient bank account before sending any transfer. If a recipient account cannot be verified, that split is marked `failed` and the others proceed.
