"use server";

// Owner dashboard data-access layer — Server Actions running on the server as the
// SIGNED-IN OWNER (request-scoped, cookie-based client). Every query is subject to
// Row Level Security: the `owner ... orders` policies in
// supabase/migrations/0003_owner_auth_policies.sql only grant access when
// is_owner() is true, so the database itself enforces access — not just the
// hidden /dashboard route. The public site NEVER imports this module.
//
// Defense in depth: requireOwner() below rejects any caller that is not an
// authenticated, allowlisted owner BEFORE a query runs, with a clear message.
// Even if that check were bypassed, RLS would still deny the rows.
//
// Every function returns a plain serializable result and never throws across the
// server/client boundary: an auth, missing-config or database error comes back as
// { ok: false, error } so the UI can surface it cleanly (and never lose orders
// silently). See docs/AUTH_SETUP.md and docs/SUPABASE_SETUP.md.

import type { OrderSnapshot, OrderStatus } from "@/types";
import type { OrdersResult, OrderResult, MutationResult, StatsResult, DashboardStats } from "@/lib/data/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Keep this list in sync with the columns in 0001_initial_schema.sql.
const COLUMNS =
  "id, public_token, number, created_at, updated_at, currency, business_type, business_type_label, " +
  "business_name, customer_name, phone, address, customer_notes, owner_notes, status, payment_status, " +
  "amount_paid, lines, separate_price, bundle_discount_pct, final_price, total_cost, profit, margin, saved";

// A loose row shape; Supabase returns snake_case columns.
type Row = Record<string, unknown>;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
function optStr(v: unknown): string | undefined {
  const s = v == null ? "" : String(v);
  return s === "" ? undefined : s;
}

/** DB row -> frontend OrderSnapshot. */
function rowToSnapshot(r: Row): OrderSnapshot {
  return {
    id: str(r.id),
    number: str(r.number),
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    currency: str(r.currency),
    businessType: str(r.business_type),
    businessTypeLabel: str(r.business_type_label),
    businessName: str(r.business_name),
    customerName: optStr(r.customer_name),
    phone: optStr(r.phone),
    address: optStr(r.address),
    customerNotes: optStr(r.customer_notes),
    ownerNotes: optStr(r.owner_notes),
    status: str(r.status) as OrderStatus,
    paymentStatus: str(r.payment_status) as OrderSnapshot["paymentStatus"],
    amountPaid: num(r.amount_paid),
    lines: Array.isArray(r.lines) ? (r.lines as OrderSnapshot["lines"]) : [],
    separatePrice: num(r.separate_price),
    bundleDiscountPct: num(r.bundle_discount_pct),
    finalPrice: num(r.final_price),
    totalCost: num(r.total_cost),
    profit: num(r.profit),
    margin: num(r.margin),
    saved: num(r.saved),
  };
}

/** Frontend snapshot -> DB columns. `preserveNumber` keeps the original NFC-#### on import. */
function toRow(o: OrderSnapshot, opts: { preserveNumber: boolean }) {
  const row: Row = {
    currency: o.currency,
    business_type: o.businessType || null,
    business_type_label: o.businessTypeLabel || null,
    business_name: o.businessName,
    customer_name: o.customerName ?? null,
    phone: o.phone ?? null,
    address: o.address ?? null,
    customer_notes: o.customerNotes ?? null,
    owner_notes: o.ownerNotes ?? null,
    status: o.status,
    payment_status: o.paymentStatus,
    amount_paid: o.amountPaid ?? 0,
    lines: o.lines,
    separate_price: o.separatePrice,
    bundle_discount_pct: o.bundleDiscountPct,
    final_price: o.finalPrice,
    total_cost: o.totalCost,
    profit: o.profit,
    margin: o.margin,
    saved: o.saved,
  };
  if (opts.preserveNumber) {
    // id stays DB-generated (old app ids are not UUIDs); number + timestamps kept.
    row.number = o.number;
    row.created_at = o.createdAt;
    row.updated_at = o.updatedAt;
  }
  return row;
}

function fail(prefix: string, error: unknown): { ok: false; error: string } {
  const msg = error instanceof Error ? error.message : String(error);
  return { ok: false, error: `${prefix}: ${msg}` };
}

/**
 * Gate every dashboard operation behind a valid, allowlisted owner session.
 * Returns the request-scoped (RLS-bound) client on success, or a clear error.
 */
async function requireOwner(): Promise<{ ok: true; supabase: SupabaseClient } | { ok: false; error: string }> {
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

/** All orders, newest first. Dashboard-only (returns private fields). */
export async function getOrders(): Promise<OrdersResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Load failed", gate.error);
    const { supabase } = gate;
    const { data, error } = await supabase
      .from("orders")
      .select(COLUMNS)
      .order("created_at", { ascending: false });
    if (error) return fail("Load failed", error);
    return { ok: true, orders: (data ?? []).map((r) => rowToSnapshot(r as unknown as Row)) };
  } catch (e) {
    return fail("Load failed", e);
  }
}

/** Insert an owner-created order (duplicate / save-as-new). DB assigns id + number. */
export async function adminCreateOrder(order: OrderSnapshot): Promise<OrderResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Create failed", gate.error);
    const { supabase } = gate;
    const { data, error } = await supabase
      .from("orders")
      .insert(toRow(order, { preserveNumber: false }))
      .select(COLUMNS)
      .single();
    if (error) return fail("Create failed", error);
    return { ok: true, order: rowToSnapshot(data as unknown as Row) };
  } catch (e) {
    return fail("Create failed", e);
  }
}

/** Full update of an existing order (status advance, notes, or re-frozen edit). */
export async function updateOrder(order: OrderSnapshot): Promise<OrderResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Save failed", gate.error);
    const { supabase } = gate;
    const { data, error } = await supabase
      .from("orders")
      .update(toRow(order, { preserveNumber: false }))
      .eq("id", order.id)
      .select(COLUMNS)
      .single();
    if (error) return fail("Save failed", error);
    return { ok: true, order: rowToSnapshot(data as unknown as Row) };
  } catch (e) {
    return fail("Save failed", e);
  }
}

/** Lightweight status-only update (kept for API completeness / future use). */
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<OrderResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Save failed", gate.error);
    const { supabase } = gate;
    const { data, error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", id)
      .select(COLUMNS)
      .single();
    if (error) return fail("Save failed", error);
    return { ok: true, order: rowToSnapshot(data as unknown as Row) };
  } catch (e) {
    return fail("Save failed", e);
  }
}

export async function deleteOrder(id: string): Promise<MutationResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Delete failed", gate.error);
    const { supabase } = gate;
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) return fail("Delete failed", error);
    return { ok: true };
  } catch (e) {
    return fail("Delete failed", e);
  }
}

/**
 * Full restore from a backup: replace ALL orders. Destructive by design (mirrors
 * the current Import, which overwrites local orders). Original numbers + created
 * timestamps are preserved; ids are re-generated.
 */
export async function replaceAllOrders(orders: OrderSnapshot[]): Promise<OrdersResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Import failed", gate.error);
    const { supabase } = gate;

    // Clear existing rows (guard: match any non-null id => all rows).
    const { error: delError } = await supabase.from("orders").delete().not("id", "is", null);
    if (delError) return fail("Import failed (clearing)", delError);

    if (orders.length > 0) {
      const { error: insError } = await supabase
        .from("orders")
        .insert(orders.map((o) => toRow(o, { preserveNumber: true })));
      if (insError) return fail("Import failed (inserting)", insError);
      // Advance the number sequence past the imported numbers.
      await supabase.rpc("sync_order_number_seq");
    }

    return getOrders();
  } catch (e) {
    return fail("Import failed", e);
  }
}

/** Aggregate totals (BASE currency) for a future dashboard summary. */
export async function getDashboardStats(): Promise<StatsResult> {
  try {
    const gate = await requireOwner();
    if (!gate.ok) return fail("Stats failed", gate.error);
    const { supabase } = gate;
    const { data, error } = await supabase.from("orders").select("final_price, total_cost, profit");
    if (error) return fail("Stats failed", error);
    const rows = (data ?? []) as unknown as Row[];
    const stats = rows.reduce<DashboardStats>(
      (acc, r) => ({
        count: acc.count + 1,
        revenue: acc.revenue + num(r.final_price),
        cost: acc.cost + num(r.total_cost),
        profit: acc.profit + num(r.profit),
      }),
      { count: 0, revenue: 0, cost: 0, profit: 0 }
    );
    return { ok: true, stats };
  } catch (e) {
    return fail("Stats failed", e);
  }
}
