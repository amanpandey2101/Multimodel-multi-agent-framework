import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

/**
 * Lazily create the Supabase browser client.
 * This avoids module-level initialization during Next.js prerendering
 * when env vars are not available.
 */
export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    _client = createClient(url, key);
  }
  return _client;
}

/**
 * Direct export for convenience — uses a Proxy so that accessing `supabase.x`
 * lazily initializes the client on first use (not at import time).
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase(), prop, receiver);
  },
});
