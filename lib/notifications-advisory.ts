// Advisory notification generator (Part 5). PURE: derives owner notifications
// from the current catalog + settings using the pricing engine. Deterministic and
// de-duplicated by a stable key, so running it on every dashboard load never
// creates duplicates (the server upsert ignores existing dedupe_keys).
//
// Covers: low margin, price recommendation (under-priced vs the engine), and
// archived-product reminders. "new_order" is created server-side by a DB trigger
// (0009); "settings_changed" is raised when the owner saves settings.

import type { Product, Settings } from "@/types";
import type { OwnerProduct } from "@/lib/data/catalog-types";
import type { NewNotification } from "@/lib/data/notification-types";
import { recommendPrice } from "@/lib/pricing";
import { formatAmount } from "@/lib/currency";

function toProduct(op: OwnerProduct): Product {
  return {
    id: op.slug,
    name: op.name,
    category: op.category,
    tag: op.tag,
    defaultCost: op.supplierCostEur,
    market: op.market,
    ladder: op.ladder,
    minMargin: op.minMargin,
    minProfit: op.minProfit,
    note: op.note,
    descriptionSq: op.descriptionSq,
  };
}

export function computeAdvisoryNotifications(products: OwnerProduct[], settings: Settings): NewNotification[] {
  const out: NewNotification[] = [];
  const cur = settings.currency;

  for (const p of products) {
    if (p.status === "archived") {
      out.push({
        type: "archived_product",
        title: `Produkt i arkivuar: ${p.name}`,
        body: `${p.name} është i arkivuar dhe nuk u shitet klientëve.`,
        dedupeKey: `archived:${p.slug}`,
        meta: { slug: p.slug },
      });
      continue;
    }
    if (!p.isActive) continue; // drafts: no advice yet

    const floor = Math.max(p.minMargin, settings.minMargin);
    const margin = p.sellPriceEur > 0 ? (p.sellPriceEur - p.supplierCostEur) / p.sellPriceEur : 0;
    if (p.sellPriceEur > 0 && margin < floor) {
      out.push({
        type: "low_margin",
        title: `Marzh i ulët: ${p.name}`,
        body: `${p.name} ka marzh ${Math.round(margin * 100)}% — nën pragun ${Math.round(floor * 100)}%.`,
        dedupeKey: `low_margin:${p.slug}`,
        meta: { slug: p.slug },
      });
    }

    // Under-priced vs the engine: recommend a raise (money left on the table).
    const rec = recommendPrice(toProduct(p), p.supplierCostEur, settings).price;
    if (rec > p.sellPriceEur + 0.5) {
      out.push({
        type: "price_recommendation",
        title: `Rekomandim çmimi: ${p.name}`,
        body: `Mund ta ngresh çmimin nga ${formatAmount(p.sellPriceEur, cur)} në ${formatAmount(rec, cur)}.`,
        dedupeKey: `price_rec:${p.slug}`,
        meta: { slug: p.slug },
      });
    }
  }

  return out.slice(0, 30);
}
