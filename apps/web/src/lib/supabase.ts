/**
 * supabase.ts — Supabase client for the frontend.
 *
 * Lazy-initialised so the app doesn't crash if Supabase env vars aren't set
 * (e.g. running with just a demo API key and no Supabase project configured).
 * In that case getSupabase() returns null and auth falls back to localStorage.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl  = import.meta.env["VITE_SUPABASE_URL"]  as string | undefined;
const supabaseAnon = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

// Only initialise if both vars are present and non-empty
let _client: SupabaseClient | null = null;

if (supabaseUrl && supabaseAnon) {
  _client = createClient(supabaseUrl, supabaseAnon, {
    auth: {
      persistSession:   true,
      autoRefreshToken: true,
    },
  });
} else {
  console.warn(
    "[NairaRails] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY not set — " +
    "Supabase auth disabled. Demo API key login still works."
  );
}

/**
 * Returns the Supabase client, or null if env vars are not configured.
 * Always null-check before calling auth methods.
 */
export function getSupabase(): SupabaseClient | null {
  return _client;
}

/**
 * Convenience export — matches the old `supabase.auth.*` call sites.
 * Falls back to a no-op stub so call sites don't need null checks everywhere.
 */
export const supabase = _client ?? {
  auth: {
    getSession:            async () => ({ data: { session: null }, error: null }),
    signInWithPassword:    async () => ({ data: { session: null, user: null }, error: { message: "Supabase not configured" } }),
    signUp:                async () => ({ data: { session: null, user: null }, error: { message: "Supabase not configured" } }),
    signOut:               async () => ({ error: null }),
    onAuthStateChange:     (_event: unknown, _cb: unknown) => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
} as unknown as SupabaseClient;
