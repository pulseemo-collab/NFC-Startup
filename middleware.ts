import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Runs server-side before matched routes render. Refreshes the Supabase session
// cookie and guards /dashboard. The public site ("/") is intentionally NOT
// matched, so anonymous customers are never touched by auth.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // /dashboard (and any future subpaths + its Server Action POSTs) and /login.
  matcher: ["/dashboard/:path*", "/login"],
};
