// Browser (anon) Supabase client.
//
// Safe to run in the browser: it uses the PUBLIC anon key, which is gated by
// Row Level Security. The public site uses this client for exactly one thing —
// creating an order via the `create_public_order` RPC (see lib/data/public-orders.ts).
// It has NO read/update/delete access to the orders table.
//
// The client is created lazily so a missing env var never crashes module
// evaluation / the production build — it only throws when actually used, with a
// clear developer-facing message (the app must fail loudly, never silently).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

/** Clear, actionable error when the public env vars are missing. */
export class SupabaseConfigError extends Error {
  constructor(missing: string) {
    super(
      `Supabase is not configured: ${missing} is missing. ` +
        `Copy .env.example to .env.local and fill in the values ` +
        `(see docs/SUPABASE_SETUP.md). The app will not persist orders until this is set.`
    );
    this.name = "SupabaseConfigError";
  }
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  browserClient = createClient(url, anonKey, {
    auth: {
      // No auth on the public site — don't persist or refresh any session.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return browserClient;
}
