import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Logout endpoint. The dashboard posts here (see the "Dil" button in NfcApp).
// Clears the Supabase session cookies server-side, then sends the user to /login.
// POST-only so it can't be triggered by a stray GET / prefetch.
export async function POST(request: Request) {
  const supabase = createSupabaseServerClient();
  await supabase.auth.signOut();
  // 303 forces the browser to follow with a GET to the login page.
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
