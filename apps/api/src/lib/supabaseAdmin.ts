/**
 * supabaseAdmin.ts — server-side Supabase client.
 *
 * Uses the SERVICE_ROLE key so it can create users and verify JWTs server-side.
 * Never expose SUPABASE_SERVICE_ROLE_KEY to the frontend.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env["SUPABASE_URL"];
const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession:   false,
  },
});
