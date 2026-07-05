/**
 * generateApiKey.ts — creates a new API key, hashes it, and returns both.
 *
 * The raw key is shown to the merchant exactly once. Only the hash is stored.
 * The prefix (first 20 chars) is stored for display in the dashboard.
 */

import crypto from "crypto";

export interface GeneratedKey {
  raw:       string;   // nrk_live_<64 hex chars> — shown once, never stored
  hash:      string;   // SHA-256 of raw — stored in DB
  prefix:    string;   // first 20 chars — stored for display
  issuedAt:  Date;
}

export function generateApiKey(): GeneratedKey {
  const raw     = "nrk_live_" + crypto.randomBytes(32).toString("hex");
  const hash    = crypto.createHash("sha256").update(raw).digest("hex");
  const prefix  = raw.slice(0, 20);
  const issuedAt = new Date();
  return { raw, hash, prefix, issuedAt };
}
