import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Shared authorization gate for every owner/dashboard data operation.
//
// Returns the request-scoped (RLS-bound) client on success, or a clear error.
// The client runs as the SIGNED-IN OWNER — never the service role — so all
// queries are additionally enforced by the owner RLS policies in the database
// (orders: migration 0003; products/app_settings: migration 0006).

export type OwnerGate = { ok: true; supabase: SupabaseClient } | { ok: false; error: string };

export async function requireOwner(): Promise<OwnerGate> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Not authenticated: no active session." };
  }
  // Owner allowlist check (is_owner() reads app_owners; see migration 0003).
  // RLS would deny the rows anyway, but this yields a precise message.
  const { data: isOwner, error: ownerError } = await supabase.rpc("is_owner");
  if (ownerError) return { ok: false, error: `Authorization check failed: ${ownerError.message}` };
  if (!isOwner) return { ok: false, error: "Not authorized: this account is not an owner." };
  return { ok: true, supabase };
}
