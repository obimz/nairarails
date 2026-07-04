# Amounts & Units

All monetary amounts in the NairaRails API are expressed in **kobo**, not naira.

---

## What is a kobo?

₦1.00 (one naira) equals 100 kobo. Kobo is the smallest subunit of the Nigerian naira — the equivalent of cents in USD.

## Why kobo?

Representing money as a decimal number (e.g. `4999.99`) in software introduces floating-point rounding errors. Two floats that should be equal sometimes aren't; split percentages that should sum to the full amount can be off by fractions. Using kobo means all amounts are integers — integer arithmetic is exact.

This is the same convention used by Stripe (cents), Paystack (kobo), and most payment infrastructure APIs.

---

## Conversion

```
naira → kobo:   multiply by 100 (and round to integer)
kobo → naira:   divide by 100
```

| Naira | Kobo |
|---|---|
| ₦1.00 | `100` |
| ₦50.00 | `5000` |
| ₦500.00 | `50000` |
| ₦5,000.00 | `500000` |
| ₦50,000.00 | `5000000` |

---

## Code examples

```js
// naira to kobo — always round, never truncate
function nairaToKobo(naira) {
  return Math.round(naira * 100);
}

// kobo to naira — for display only, never pass back to the API
function koboToNaira(kobo) {
  return (kobo / 100).toFixed(2);
}

// formatting for display
function formatNaira(kobo) {
  return "₦" + (kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 });
}

formatNaira(500000); // → "₦5,000.00"
```

---

## Rules

- Always send `expected_amount_kobo` as a **positive integer**. Decimals will be rejected with `422`.
- The API never returns naira floats — all `_kobo` fields are integers.
- Refund amounts are calculated by the server, not passed by the caller. You do not need to specify the refund amount when triggering a refund action.
