// Session refresh + route protection, run from the Next.js middleware.
//
// Two jobs:
//   1. Refresh the Supabase auth cookie on every matched request so a signed-in
//      owner stays logged in across page loads (server components read a fresh
//      session).
//   2. Server-side guard for /dashboard: an unauthenticated visitor is redirected
//      to /login. This is REAL protection (it runs before the page renders) — not
//      client-only hiding.
//
// Note: this checks that a valid session EXISTS. Owner-level authorization (only
// the allowlisted owner may read/write orders) is enforced by RLS in the database
// (supabase/migrations/0003_owner_auth_policies.sql) and re-checked in the data
// layer (lib/data/orders.ts). Route guard + RLS are complementary, not redundant.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // If Supabase isn't configured, don't crash the whole site — just let the
  // request through. The dashboard's data layer will surface a clear config error.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // IMPORTANT: getUser() (not getSession()) — it revalidates the token with the
  // Supabase Auth server, so the guard can't be spoofed by a forged cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Unauthenticated -> block the dashboard, send to login.
  if (!user && pathname.startsWith("/dashboard")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  // Already authenticated -> skip the login page, go straight to the dashboard.
  if (user && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}
