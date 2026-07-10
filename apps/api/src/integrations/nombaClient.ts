// apps/api/src/integrations/nombaClient.ts
//
// All outbound Nomba API calls live here — single import point for every route.
//
// Required headers on every authenticated call (per Training.md Module 03):
//   Authorization: Bearer <access_token>
//   accountId:     NOMBA_ACCOUNT_ID
//   Content-Type:  application/json
//
// Token lifecycle: valid 60 min, cached at module scope, refreshed at 55-min mark.
// Never request a fresh token per call — that burns quota and adds latency.

import { logger } from "../lib/logger.js";

const BASE_URL      = process.env["NOMBA_BASE_URL"]        ?? "https://sandbox.api.nomba.com/v1";
const V2_BASE_URL   = BASE_URL.replace("/v1", "/v2");
const ACCOUNT_ID    = process.env["NOMBA_ACCOUNT_ID"]      ?? "";
const SUB_ACCOUNT_ID = process.env["NOMBA_SUB_ACCOUNT_ID"] ?? "";
const CLIENT_ID     = process.env["NOMBA_CLIENT_ID"]       ?? "";
const CLIENT_SECRET = process.env["NOMBA_CLIENT_SECRET"]   ?? "";

// ─── Typed error ──────────────────────────────────────────────────────────────
export class NombaApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "NombaApiError";
  }
}

// ─── Token cache ──────────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt: number = 0; // unix ms — refresh when within 5 min of expiry

// ─── Shared request helper ────────────────────────────────────────────────────
// Wraps fetch with auth headers, JSON parsing, and structured error logging.
// Throws a descriptive Error on any non-2xx response so callers can catch + surface it.
// Pass `baseUrl` to override the default BASE_URL (e.g. BASE_URL_V2 for transfers).
async function nombaRequest<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
  skipAuth = false,
  baseUrl = BASE_URL
): Promise<T> {
  const token = skipAuth ? null : await getAccessToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "accountId":    ACCOUNT_ID,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const fetchInit: RequestInit = { method, headers };
  if (body !== undefined) {
    fetchInit.body = JSON.stringify(body);
  }

  const res = await fetch(`${baseUrl}${path}`, fetchInit);

  const json = await res.json() as Record<string, unknown>;

  if (!res.ok) {
    const errMsg =
      (json["description"] as string | undefined) ??
      (json["message"] as string | undefined) ??
      (json["error"] as string | undefined) ??
      `Nomba API error ${res.status}`;
    logger.error({ path, status: res.status, body: json }, errMsg);
    throw new NombaApiError(res.status, errMsg, json);
  }

  return json as T;
}

// ─── Authentication ───────────────────────────────────────────────────────────

/**
 * Returns a valid access token, fetching a new one when the cache is empty
 * or within 5 minutes of expiry (55-min threshold per Training.md Module 03).
 *
 * Thread-safety note: this is a single-process Node server so module-scope
 * variables are safe — no mutex needed.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Refresh if we have no token or if we're within 5 min of expiry.
  if (cachedToken && now < tokenExpiresAt - 5 * 60 * 1000) {
    return cachedToken;
  }

  logger.info("Fetching new Nomba access token");

  const response = await nombaRequest<{ data: { access_token: string } }>(
    "POST",
    "/auth/token/issue",
    {
      grant_type:    "client_credentials",
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    },
    true // skipAuth — this call issues the token, no Bearer header yet
  );

  cachedToken    = response.data.access_token;
  tokenExpiresAt = now + 60 * 60 * 1000; // tokens valid 60 min

  logger.info("Nomba access token acquired and cached");
  return cachedToken;
}

// ─── Virtual Accounts ─────────────────────────────────────────────────────────

export interface CreateVirtualAccountParams {
  /** Your stable order reference — used as accountRef so you can look it up later */
  accountRef: string;
  /** Display name shown to the payer (e.g. "NairaRails — Order ord_9821") */
  accountName: string;
  /** Expected payment amount in kobo */
  expectedAmountKobo: number;
  /** ISO 8601 date — optional, omit for permanent VAs */
  expiryDate?: string;
}

export interface CreateVirtualAccountResult {
  accountNumber: string;
  bankName:      string;
  bankCode:      string;
}

// Shared helper — extracts account fields from whatever shape Nomba returns.
// Accepts the full response object and walks known shapes to find the NUBAN.
function extractVAFields(response: Record<string, unknown>): CreateVirtualAccountResult {
  // Log the full raw response so we can see exactly what Nomba returned.
  logger.info({ vaRawResponse: JSON.stringify(response) }, "Nomba VA raw response");

  // Nomba may nest the account under response.data, or return it at the top level.
  const d = (response["data"] as Record<string, unknown> | undefined) ?? response;

  const accountNumber =
    (d["bankAccountNumber"]    as string | undefined) ??  // real Nomba field
    (d["accountNumber"]        as string | undefined) ??
    (d["nuban"]                as string | undefined) ??
    (d["accountId"]            as string | undefined) ??
    (d["virtualAccountNumber"] as string | undefined) ??
    "";
  const bankName = (d["bankName"] as string | undefined) ?? "Nomba";
  const bankCode = (d["bankCode"] as string | undefined) ?? "000026";

  return { accountNumber, bankName, bankCode };
}

/**
 * Create a virtual account (NUBAN) for a single order.
 * POST /accounts/virtual
 * POST /accounts/virtual/{subAccountId}
 *
 * accountRef = order_ref so aliasAccountReference in the webhook maps back
 * to the order with no secondary lookup.
 *
 * A 400 "accountRef already exists" from Nomba means the order_ref was already
 * used — this should never happen in normal flow because the DB unique constraint
 * on order_ref prevents duplicates. If it does happen, surface it as an error
 * rather than silently fetching the existing VA (which could mask a real bug).
 */
export async function createVirtualAccount(
  params: CreateVirtualAccountParams
): Promise<CreateVirtualAccountResult> {
  const { accountRef, accountName, expectedAmountKobo, expiryDate } = params;

  if (!SUB_ACCOUNT_ID) {
    throw new Error(
      "createVirtualAccount: NOMBA_SUB_ACCOUNT_ID is not set. " +
      "Virtual account webhooks will not fire without it. " +
      "Add NOMBA_SUB_ACCOUNT_ID to your .env file."
    );
  }

  logger.info({ accountRef, accountName, expectedAmountKobo }, "Creating Nomba virtual account");

  type VAResponse = { data: Record<string, unknown> };

  // Path includes the subAccountId — this is what makes Nomba fire webhooks.
  const response = await nombaRequest<VAResponse>(
    "POST",
    `/accounts/virtual/${SUB_ACCOUNT_ID}`,
    {
      accountRef,
      accountName,
      amount: expectedAmountKobo,
      ...(expiryDate ? { expiryDate } : {}),
    }
  );

  const result = extractVAFields(response as Record<string, unknown>);

  if (!result.accountNumber) {
    throw new Error(`createVirtualAccount: Nomba returned no account number for ref ${accountRef}`);
  }

  logger.info({ accountRef, accountNumber: result.accountNumber }, "Virtual account created");
  return result;
}

/**
 * Expire a virtual account on Nomba's side.
 * DELETE /v1/accounts/virtual/{identifier}
 *
 * identifier = the accountRef used when creating the VA (i.e. our order_ref).
 * Returns { expired: true } on success.
 * Call this whenever we mark an order expired or nuke it locally so Nomba's
 * side stays in sync and the VA stops accepting payments.
 */
export async function expireVirtualAccount(accountRef: string): Promise<void> {
  logger.info({ accountRef }, "Expiring Nomba virtual account");

  type ExpireResponse = { data: { expired: boolean } };

  const response = await nombaRequest<ExpireResponse>(
    "DELETE",
    `/accounts/virtual/${encodeURIComponent(accountRef)}`
  );

  if (!response.data.expired) {
    throw new Error(`expireVirtualAccount: Nomba did not confirm expiry for ref ${accountRef}`);
  }

  logger.info({ accountRef }, "Nomba virtual account expired");
}

// ─── Bank Codes ───────────────────────────────────────────────────────────────

export interface NombaBank {
  code: string;
  name: string;
}

/**
 * Fetch all supported bank codes from Nomba.
 * GET /v1/transfers/banks
 *
 * Call once and cache — bank codes rarely change.
 * Use the returned `code` as `bankCode` in lookup and transfer requests.
 */
export async function fetchBankCodes(): Promise<NombaBank[]> {
  type BanksResponse = { data: { code: string; name: string }[] };

  const response = await nombaRequest<BanksResponse>("GET", "/transfers/banks");
  return response.data.map((b) => ({ code: b.code, name: b.name }));
}

// ─── Transfers ────────────────────────────────────────────────────────────────

export interface LookupBankAccountParams {
  bankCode:      string;
  accountNumber: string;
}

export interface LookupBankAccountResult {
  accountName: string;
}

/**
 * Resolve a bank account number to the registered account name.
 * POST /v2/transfers/bank/lookup
 *
 * ALWAYS call this before transferToBank — sending to a wrong NUBAN can be
 * irreversible, and the resolved name is a required field on the transfer.
 */
export async function lookupBankAccount(
  params: LookupBankAccountParams
): Promise<LookupBankAccountResult> {
  const { bankCode, accountNumber } = params;

  logger.info({ bankCode, accountNumber }, "Looking up bank account");

  const token = await getAccessToken();
  const res = await fetch(`${V2_BASE_URL}/transfers/bank/lookup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "accountId": ACCOUNT_ID,
    },
    body: JSON.stringify({ bankCode, accountNumber }),
  });

  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const errMsg = (json["message"] as string) ?? `Nomba lookup error ${res.status}`;
    logger.error({ bankCode, accountNumber, status: res.status, body: json }, errMsg);
    throw new NombaApiError(res.status, errMsg, json);
  }

  const data = json["data"] as Record<string, unknown> | undefined;
  const accountName = (data?.["accountName"] as string) ?? "";
  logger.info({ bankCode, accountNumber, accountName }, "Bank account resolved");
  return { accountName };
}

export interface TransferToBankParams {
  amountKobo:    number;
  bankCode:      string;
  accountNumber: string;
  /** Must come from lookupBankAccount — do not pass a user-supplied string */
  accountName:   string;
  narration:     string;
  /** Globally unique reference — idempotency key for this transfer */
  merchantTxRef: string;
}

export interface TransferToBankResult {
  transferRef: string;
  status:      string;
}

/**
 * Initiate a bank transfer to a verified recipient.
 * POST /v2/transfers/bank
 *
 * IMPORTANT: Nomba Transfers API expects amount in NAIRA, not kobo.
 * This function accepts kobo (internal standard) and converts before sending.
 *
 * merchantTxRef must be unique per transfer — collisions will cause Nomba to
 * return the original transfer result rather than initiating a new one, which
 * is the correct idempotency behaviour but will silently succeed on the caller side.
 * Use a compound key: `split_{orderRef}_{party}_{requestId}` or similar.
 */
export async function transferToBank(
  params: TransferToBankParams
): Promise<TransferToBankResult> {
  const { amountKobo, bankCode, accountNumber, accountName, narration, merchantTxRef } = params;

  const amountNaira = amountKobo / 100;

  logger.info(
    { amountKobo, amountNaira, bankCode, accountNumber, merchantTxRef },
    "Initiating bank transfer (v2)"
  );

  const token = await getAccessToken();
  const res = await fetch(`${V2_BASE_URL}/transfers/bank`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      "accountId": ACCOUNT_ID,
    },
    body: JSON.stringify({
      amount:        amountNaira,
      bankCode,
      accountNumber,
      accountName,
      senderName:    "NairaRails",
      narration,
      merchantTxRef,
    }),
  });

  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const errMsg = (json["message"] as string) ?? `Nomba transfer error ${res.status}`;
    logger.error({ amountKobo, bankCode, accountNumber, status: res.status, body: json }, errMsg);
    throw new NombaApiError(res.status, errMsg, json);
  }

  const d = (json["data"] as Record<string, unknown>) ?? {};
  const transferRef = (d["merchantTxRef"] as string) ?? (d["transferId"] as string) ?? (d["reference"] as string) ?? merchantTxRef;
  const status      = (d["status"] as string) ?? "pending";

  logger.info(
    { transferRef, status, amountKobo, amountNaira, accountNumber, merchantTxRef },
    "Bank transfer initiated (v2)"
  );

  return { transferRef, status };
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface ListTransactionsParams {
  dateFrom:  string; // ISO 8601 date e.g. "2026-07-01"
  dateTo:    string;
  status?:   "success" | "failed" | "pending";
  page?:     number;
  pageSize?: number;
}

export interface NombaTransaction {
  transactionId:  string; // always "" when absent — mapping provides fallback
  merchantTxRef:  string;
  amount:         number; // NAIRA (Nomba always returns naira) — convert ×100 for kobo comparisons
  status:         string;
  type:           string;
  createdAt:      string;
  narration?:     string | undefined;
}

export interface ListTransactionsResult {
  transactions: NombaTransaction[];
  totalCount:   number;
}

/**
 * List transactions from Nomba for a date range.
 * GET /v1/transactions/accounts/{subAccountId}
 *
 * Correct v1 path per Nomba API reference — scoped to the sub-account.
 * Authorization header carries parent accountId.
 *
 * Used by the reconciliation backstop to diff Nomba's view against
 * the local ledger_entries table. Reconcile by merchantTxRef — that's
 * the shared key between Nomba's records and ours.
 */
export async function listTransactions(
  params: ListTransactionsParams
): Promise<ListTransactionsResult> {
  const { dateFrom, dateTo, status = "success", page = 1, pageSize = 100 } = params;

  const qs = new URLSearchParams({
    dateFrom,
    dateTo,
    status,
    page:     String(page),
    pageSize: String(pageSize),
  });

  logger.info({ dateFrom, dateTo, status }, "Fetching Nomba transactions");

  type TxResponse = {
    data: {
      transactions?: Record<string, unknown>[];
      records?:      Record<string, unknown>[];
      totalCount?:   number;
      total?:        number;
    };
  };

  const response = await nombaRequest<TxResponse>(
    "GET",
    `/transactions/accounts/${SUB_ACCOUNT_ID}?${qs.toString()}`
  );
  const d = response.data;

  // Nomba may return the list under `transactions` or `records`.
  const raw = d.transactions ?? d.records ?? [];
  const totalCount = d.totalCount ?? d.total ?? raw.length;

  const transactions: NombaTransaction[] = raw.map((tx) => ({
    transactionId: (tx["transactionId"] as string | undefined) ?? "",
    merchantTxRef: (tx["merchantTxRef"] as string | undefined) ?? "",
    amount:        (tx["amount"]        as number | undefined) ?? 0,
    status:        (tx["status"]        as string | undefined) ?? "",
    type:          (tx["type"]          as string | undefined) ?? "",
    createdAt:     (tx["createdAt"]     as string | undefined) ?? "",
    narration:     (tx["narration"]     as string | undefined),
  }));

  logger.info({ count: transactions.length, totalCount }, "Nomba transactions fetched");
  return { transactions, totalCount };
}
