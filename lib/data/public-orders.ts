// Public (customer) order creation — runs in the BROWSER with the anon key.
//
// The public site's ONLY database operation. It calls the create_public_order
// RPC (SECURITY DEFINER), which is the only thing the anon role is allowed to do.
// The RPC assigns the order number + id server-side and returns just the safe
// fields the receipt needs. Cost / profit / margin are never read back.
//
// The financials are computed client-side (the pricing engine and product costs
// live in the browser bundle today) and sent in the payload, exactly as the app
// already computes them for localStorage. See docs/SUPABASE_SETUP.md for the
// known limitation this implies.

import type { OrderSnapshot } from "@/types";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface CreatedOrder {
  id: string;
  number: string;
  publicToken: string;
  createdAt: string;
}

export type CreatePublicOrderResult =
  | { ok: true; created: CreatedOrder }
  | { ok: false; error: string };

/** Build the whitelisted payload the RPC accepts (no status/payment/notes-private/id/number). */
function toPayload(order: OrderSnapshot) {
  return {
    currency: order.currency,
    businessType: order.businessType,
    businessTypeLabel: order.businessTypeLabel,
    businessName: order.businessName,
    customerName: order.customerName ?? null,
    phone: order.phone ?? null,
    address: order.address ?? null,
    customerNotes: order.customerNotes ?? null,
    lines: order.lines,
    separatePrice: order.separatePrice,
    bundleDiscountPct: order.bundleDiscountPct,
    finalPrice: order.finalPrice,
    totalCost: order.totalCost,
    profit: order.profit,
    margin: order.margin,
    saved: order.saved,
  };
}

export async function createPublicOrder(order: OrderSnapshot): Promise<CreatePublicOrderResult> {
  try {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("create_public_order", { payload: toPayload(order) });
    if (error) return { ok: false, error: error.message };

    const d = (data ?? {}) as Record<string, string>;
    if (!d.id || !d.number) return { ok: false, error: "Order creation returned no id/number." };

    return {
      ok: true,
      created: { id: d.id, number: d.number, publicToken: d.public_token, createdAt: d.created_at },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
