/**
 * apiFetch — the single fetch wrapper for all API calls.
 *
 * Auth strategy (post Phase E):
 *   - Dashboard routes (/api/v1/auth/*, /api/v1/merchants/keys/*, /api/v1/dashboard/*)
 *     → attach Supabase session JWT as `Authorization: Bearer <token>`
 *   - Programmatic routes (/api/v1/orders, /api/v1/exceptions, etc.)
 *     → attach `x-api-key` from localStorage (backwards compat for demo seed key)
 *   - Public routes (register, login, webhooks) → no auth header
 */

import { supabase } from "./supabase.js";

const API_BASE = import.meta.env["VITE_API_BASE"] as string | undefined ?? "http://localhost:3000";

// Routes that use JWT (Supabase session) instead of x-api-key
const JWT_PATHS = [
  "/api/v1/auth/logout",
  "/api/v1/auth/me",
  "/api/v1/merchants/keys",   // GET key info + POST issue/rotate/revoke
  "/api/v1/merchants/profile", // PATCH profile
  "/api/v1/dashboard",
];

// Routes that require no auth header at all
const PUBLIC_PATHS = [
  "/api/v1/auth/register",
  "/api/v1/auth/login",
  "/api/v1/webhooks/nomba",
  "/api/v1/merchants/signup", // legacy — kept for seed key compat
];

async function getAuthHeader(path: string): Promise<Record<string, string>> {
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));
  if (isPublic) return {};

  const isJwt = JWT_PATHS.some((p) => path.startsWith(p));
  if (isJwt) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) return { "Authorization": `Bearer ${token}` };
    return {};
  }

  // Programmatic route — use x-api-key from localStorage
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
