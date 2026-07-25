// Global dashboard search (Part 7). PURE matching over the already-loaded owner
// data — orders + catalog. Searches across order number, business name/type,
// customer, phone, status and notes, plus products and aggregated business types
// and customers. No I/O; the /dashboard tree is the only importer.

import type { OrderSnapshot } from "@/types";
import type { OwnerProduct } from "@/lib/data/catalog-types";
import { ORDER_STATUS_LABEL } from "@/lib/i18n";

export interface SearchGroups {
  orders: OrderSnapshot[];
  products: OwnerProduct[];
  businesses: { label: string; count: number }[];
  customers: { name: string; count: number }[];
  total: number;
}

const LIMITS = { orders: 6, products: 6, businesses: 5, customers: 5 };

const has = (haystack: string | undefined, q: string) => (haystack ?? "").toLowerCase().includes(q);

export function searchAll(orders: OrderSnapshot[], products: OwnerProduct[], query: string): SearchGroups {
  const q = query.trim().toLowerCase();
  const empty: SearchGroups = { orders: [], products: [], businesses: [], customers: [], total: 0 };
  if (q === "") return empty;

  const matchedOrders = orders.filter((o) => {
    const statusLabel = ORDER_STATUS_LABEL[o.status] ?? o.status;
    return (
      has(o.number, q) ||
      has(o.businessName, q) ||
      has(o.businessTypeLabel, q) ||
      has(o.customerName, q) ||
      has(o.phone, q) ||
      has(statusLabel.toLowerCase(), q) ||
      has(o.ownerNotes, q) ||
      has(o.customerNotes, q)
    );
  });

  const matchedProducts = products.filter(
    (p) => has(p.name, q) || has(p.slug, q) || has(p.category, q)
  );

  // Aggregate business types + customers (distinct, with order counts).
  const bizMap = new Map<string, number>();
  const custMap = new Map<string, number>();
  for (const o of orders) {
    const label = o.businessTypeLabel || o.businessType;
    if (label && has(label, q)) bizMap.set(label, (bizMap.get(label) ?? 0) + 1);
    if (o.customerName && has(o.customerName, q)) custMap.set(o.customerName, (custMap.get(o.customerName) ?? 0) + 1);
  }
  const businesses = [...bizMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, LIMITS.businesses);
  const customers = [...custMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, LIMITS.customers);

  const cappedOrders = matchedOrders.slice(0, LIMITS.orders);
  const cappedProducts = matchedProducts.slice(0, LIMITS.products);

  return {
    orders: cappedOrders,
    products: cappedProducts,
    businesses,
    customers,
    total: cappedOrders.length + cappedProducts.length + businesses.length + customers.length,
  };
}
