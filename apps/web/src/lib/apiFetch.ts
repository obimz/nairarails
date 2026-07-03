/**
 * apiFetch — the single fetch wrapper for all API calls.
 *
 * Reads VITE_API_BASE from the environment (set to the mock server port
 * during Phase 7, swapped to the real API in Phase 9).
 *
 * On non-2xx responses, parses the contract error shape
 * { error: { code, message, field? } } and throws an ApiError so every
 * caller can catch a single, typed error class rather than raw fetch errors.
 *
 * Phase 16: Reads the stored API key from localStorage and attaches it as
 * `x-api-key` on every request to /api/v1/* — except the two public routes
 * that must never carry an API key:
 *   - POST /api/v1/merchants/signup  (issues the key, can't have one yet)
 *   - POST /api/v1/webhooks/nomba    (authenticated by Nomba HMAC, not API key)
 */

const API_BASE = import.meta.env["VITE_API_BASE"] as string | undefined ?? "http://localhost:3000";

// Paths that must never have an x-api-key header attached, even if one is stored.
const PUBLIC_PATHS = [
  "/api/v1/merchants/signup",
  "/api/v1/webhooks/nomba",
];

function getApiKeyHeader(path: string): Record<string, string> {
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  if (isPublic) return {};

  const key = localStorage.getItem("nairarails_api_key");
  if (!key) return {};

  return { "x-api-key": key };
}

// ─── Error class ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Core wrapper ─────────────────────────────────────────────────────────────

/**
 * @param path   — path relative to VITE_API_BASE, must start with "/"
 * @param init   — standard RequestInit (method, body, headers…)
 * @returns      — parsed JSON response body, typed as T
 * @throws ApiError on non-2xx, or Error on network failure
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...getApiKeyHeader(path),
        ...(init?.headers ?? {}),
      },
      ...init,
    });
  } catch (networkErr) {
    // fetch() only throws on network-level failures (no connection, DNS, etc.)
    throw new Error(`Network error reaching ${url}: ${String(networkErr)}`);
  }

  // Parse body — always JSON in this API.
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Non-JSON response from ${url} (status ${res.status})`);
  }

  if (!res.ok) {
    // Try to extract the contract error shape.
    const errShape = body as { error?: { code?: string; message?: string; field?: string } };
    const code    = errShape.error?.code    ?? "UNKNOWN_ERROR";
    const message = errShape.error?.message ?? `Request failed with status ${res.status}`;
    const field   = errShape.error?.field;
    throw new ApiError(res.status, code, message, field);
  }

  return body as T;
}

// ─── Convenience shorthands ──────────────────────────────────────────────────

export const apiGet = <T>(path: string) =>
  apiFetch<T>(path, { method: "GET" });

export const apiPost = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, {
    method: "POST",
    // null is acceptable as BodyInit; undefined is not with exactOptionalPropertyTypes
    body:   body !== undefined ? JSON.stringify(body) : null,
  });
