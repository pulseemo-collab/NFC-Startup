// Server-only (service-role) Supabase client.
//
// This client uses the SERVICE ROLE key, which bypasses Row Level Security and
// has full database access. It must NEVER reach the browser. `import "server-only"`
// makes the build fail if this module is ever pulled into a client bundle.
//
// It is used by the owner dashboard data-access layer (lib/data/orders.ts) via
// Next.js Server Actions. When Supabase Auth is added for /dashboard later, these
// calls should move to a user-context client + `authenticated` RLS policies (already
// written in supabase/migrations/0002_rls_policies.sql) and this admin client can be
// retired for the dashboard. See docs/SUPABASE_SETUP.md ("Authentication phase").

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SupabaseConfigError } from "@/lib/supabase/client";

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  // The admin client reads the URL from the public var (same project) and the
  // secret from the NON-public var — never expose the service role to the client.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) throw new SupabaseConfigError("SUPABASE_SERVICE_ROLE_KEY");

  adminClient = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return adminClient;
}
