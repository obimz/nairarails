# Exceptions & Refunds

An exception is any order where the payment didn't match exactly. NairaRails surfaces all exceptions in your dashboard and gives you API endpoints to resolve each type.

---

## Exception types

### Underpayment

The buyer paid **less** than the required amount. All splits are held — no party receives any funds until the order is resolved.

**Resolution:** Issue a full refund of the received amount back to the buyer. The order is closed as `refunded`. If the buyer still needs to complete the purchase, create a new order for the full amount.

### Overpayment

The buyer paid **more** than the required amount. Splits execute on the expected amount — the seller, platform, and rider all receive their correct cut. The excess is held separately and not distributed.

**Resolution:** Refund the excess amount back to the buyer. The order moves to `paid`.

### Unmatched

A bank transfer arrived on NairaRails infrastructure but could not be linked to any order. This can happen if a buyer manually transfers to an account number without using a NairaRails-issued NUBAN, or if the order was already expired.

**Resolution:** Manual investigation required. Contact support with the event timestamp and the sender's account details. No automated refund path is available for unmatched payments — the original sender information may be incomplete.

---

## List exceptions

```http
GET /api/v1/exceptions
x-api-key: nrk_live_your_key
```

Optional query parameter: `?type=underpayment` | `overpayment` | `unmatched`

### Response `200`

```json
{
  "results": [
    {
      "order_ref": "ord-1002",
      "type": "underpayment",
      "expected_amount_kobo": 500000,
      "received_amount_kobo": 450000,
      "shortfall_kobo": 50000,
      "excess_kobo": 0,
      "raised_at": "2026-07-04T10:22:00Z",
      "resolved": false,
      "resolved_at": null
    }
  ],
  "total_count": 1
}
```

---

## Refund excess (overpayment)

Transfers the excess amount back to the original sender. The order status moves to `paid`.

```http
POST /api/v1/exceptions/:order_ref/refund-excess
x-api-key: nrk_live_your_key
```

No request body needed — NairaRails uses the sender account details captured when the payment arrived.

### Response `200`

```json
{
  "order_ref": "ord-1003",
  "refunded_amount_kobo": 50000,
  "sender_account": "0123456789",
  "sender_bank": "058",
  "status": "resolved",
  "transfer_ref": "nrk_txn_abc123"
}
```

### Errors

| Code | Meaning |
|---|---|
| `ORDER_NOT_FOUND` | No overpayment order with that reference exists on your account |
| `VALIDATION_ERROR` | The order is not in `overpayment` status, or no sender account is on record |

---

## Refund shortfall (underpayment)

Returns the full received amount to the original sender. The order status moves to `refunded` and is closed.

```http
POST /api/v1/exceptions/:order_ref/refund-shortfall
x-api-key: nrk_live_your_key
```

No request body needed.

### Response `200`

```json
{
  "order_ref": "ord-1002",
  "refunded_amount_kobo": 450000,
  "sender_account": "0123456789",
  "sender_bank": "058",
  "status": "resolved",
  "transfer_ref": "nrk_txn_def456"
}
```

### Errors

| Code | Meaning |
|---|---|
| `ORDER_NOT_FOUND` | No underpayment order with that reference exists on your account |
| `VALIDATION_ERROR` | The order is not in `underpayment` status, or no sender account is on record |

---

## Refunds in the dashboard

You can trigger both refund actions directly from the **Exceptions** tab in your dashboard without any API calls. Each action shows a confirmation dialog before executing — refunds are irreversible.

The dashboard also shows **Unmatched** payments in a separate tab so you have full visibility into every payment event that touched your integration.

---

## What happens to split transfers on a refunded underpayment?

When an underpayment is refunded, no split transfers were ever sent (they were held when the underpayment was classified). Refunding simply returns the received amount to the buyer — no reversal of split transfers is needed.
