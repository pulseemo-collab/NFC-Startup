// Browser AUTH client (cookie-based session).
//
// Used only by the login page (app/login/LoginForm.tsx) to sign the owner in.
// Unlike lib/supabase/client.ts (which is the anon, session-less client the
// PUBLIC order flow uses), this client stores the session in cookies via
// @supabase/ssr, so the middleware and server components can read it.
//
// Uses the PUBLIC anon key. Never the service role key.

import { createBrowserClient } from "@supabase/ssr";
import { SupabaseConfigError } from "@/lib/supabase/client";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return createBrowserClient(url, anonKey);
}
