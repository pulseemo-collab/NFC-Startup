// Result shapes for the order data-access layer. Kept in a plain module so the
// "use server" file (lib/data/orders.ts) exports only async Server Actions.

import type { OrderSnapshot } from "@/types";

export type OrdersResult = { ok: true; orders: OrderSnapshot[] } | { ok: false; error: string };
export type OrderResult = { ok: true; order: OrderSnapshot } | { ok: false; error: string };
export type MutationResult = { ok: true } | { ok: false; error: string };
export type StatsResult = { ok: true; stats: DashboardStats } | { ok: false; error: string };

export interface DashboardStats {
  count: number;
  revenue: number; // sum of final_price (BASE currency)
  cost: number; // sum of total_cost
  profit: number; // sum of profit
}
