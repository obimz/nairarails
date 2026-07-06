/**
 * apiFetch — the single fetch wrapper for all API calls.
 *
 * Auth strategy:
 *   Public routes  → no credential header
 *   All other routes → session-first resolution:
 *     1. Active Supabase JWT  → Authorization: Bearer <token>
 *        Works on any device; no localStorage dependency.
 *        The backend's authAny middleware accepts this on every protected route.
 *     2. No session, but localStorage API key present → x-api-key header
 *        Backwards-compatible path for CI callers and the demo seed key.
 *     3. Neither → no header (request will get 401 from the backend, which is correct)
 *
 * Why session-first instead of path-based routing:
 *   A logged-in user on a new device has a valid Supabase session but no
 *   localStorage key (it never left the browser that originally issued it).
 *   Attaching the JWT solves cross-device access without requiring the server
 *   to ever expose a key's plaintext again.
 */

import { supabase } from "./supabase.js";

const API_BASE = import.meta.env["VITE_API_BASE"] as string | undefined ?? "http://localhost:3000";

// Routes that bypass auth entirely — no credential header attached.
const PUBLIC_PATHS = [
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/webhooks/nomba",
  "/api/v1/merchants/signup", // legacy — kept for demo seed key compat
];

async function getAuthHeader(path: string): Promise<Record<string, string>> {
  // Public routes need no credential.
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return {};

  // Prefer an active Supabase session — works on any device, no localStorage needed.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) return { "Authorization": `Bearer ${token}` };

  // Fallback: static API key from localStorage (CI callers, demo seed key).
  const key = localStorage.getItem("nairarails_api_key");
  if (key) return { "x-api-key": key };

  // No credential available — return empty and let the backend reject with 401.
  return {};
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

  const authHeader = await getAuthHeader(path);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...authHeader,
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
    body:   body !== undefined ? JSON.stringify(body) : null,
  });

// ─── Admin helpers ────────────────────────────────────────────────────────────
// Uses x-admin-secret header instead of x-api-key.
// Secret is passed explicitly per call — never stored in localStorage.

export async function adminFetch<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  secret: string,
  body?: unknown
): Promise<T> {
  const url = `${API_BASE}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type":    "application/json",
        "x-admin-secret":  secret,
      },
      body: body !== undefined ? JSON.stringify(body) : null,
    });
  } catch (networkErr) {
    throw new Error(`Network error reaching ${url}: ${String(networkErr)}`);
  }

  let responseBody: unknown;
  try {
    responseBody = await res.json();
  } catch {
    throw new Error(`Non-JSON response from ${url} (status ${res.status})`);
  }

  if (!res.ok) {
    const errShape = responseBody as { error?: string | { message?: string } };
    const message =
      typeof errShape.error === "string"
        ? errShape.error
        : errShape.error?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, "ADMIN_ERROR", message);
  }

  return responseBody as T;
}
