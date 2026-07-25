// Pure DB-row → OrderSnapshot mapping. Extracted from the "use server" data layer
// so it can be shared by BOTH the server actions (lib/data/orders.ts) and the
// client-side Realtime handlers (lib/realtime/useOwnerRealtime.ts). No I/O, no
// secrets — just shape conversion of an already-authorized row.

import type { OrderSnapshot, OrderStatus } from "@/types";

export type Row = Record<string, unknown>;

export function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}
export function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}
export function optStr(v: unknown): string | undefined {
  const s = v == null ? "" : String(v);
  return s === "" ? undefined : s;
}

/** DB row (snake_case) -> frontend OrderSnapshot. */
export function rowToSnapshot(r: Row): OrderSnapshot {
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
