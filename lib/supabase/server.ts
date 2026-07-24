// Request-scoped server client (cookie-based session).
//
// Runs on the server as the SIGNED-IN USER — not the service role. It reads the
// Supabase session from the request cookies, so every query it makes is subject
// to Row Level Security. This is what makes the dashboard enforce owner access at
// the DATABASE level (see supabase/migrations/0003_owner_auth_policies.sql), not
// merely by hiding the /dashboard route.
//
// Uses the PUBLIC anon key + the user's cookie — never the service role key.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SupabaseConfigError } from "@/lib/supabase/client";

/**
 * Create a Supabase client bound to the current request's cookies.
 * Safe to call in Server Components, Route Handlers and Server Actions.
 *
 * Cookie writes (token refresh) are wrapped in try/catch: writing cookies from a
 * Server Component render is not allowed by Next.js, but the middleware
 * (lib/supabase/middleware.ts) refreshes the session there, so a failed write in
 * a read-only context is safe to ignore.
 */
export function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) throw new SupabaseConfigError("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const cookieStore = cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component render — ignore; middleware refreshes.
        }
      },
    },
  });
}
