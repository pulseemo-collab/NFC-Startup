"use client";

// Global search overlay (Part 7). A command-palette that searches orders,
// products, business types and customers. Opens with Ctrl/Cmd+K or "/". Keyboard
// navigable (↑/↓/Enter/Esc). Reads only the already-loaded owner data.

import { useEffect, useMemo, useRef, useState } from "react";
import type { OrderSnapshot } from "@/types";
import type { OwnerProduct } from "@/lib/data/catalog-types";
import { searchAll } from "@/lib/search";
import { formatAmount } from "@/lib/currency";
import { t, ORDER_STATUS_LABEL } from "@/lib/i18n";

interface FlatItem {
  key: string;
  group: string;
  title: string;
  sub: string;
  badge?: string;
  run: () => void;
}

export default function GlobalSearch({
  orders,
  products,
  currency,
  onOpenOrder,
  onOpenProduct,
  onSeedOrders,
  onClose,
}: {
  orders: OrderSnapshot[];
  products: OwnerProduct[];
  currency: string;
  onOpenOrder: (id: string) => void;
  onOpenProduct: (slug: string) => void;
  onSeedOrders: (query: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const groups = useMemo(() => searchAll(orders, products, query), [orders, products, query]);

  const items = useMemo<FlatItem[]>(() => {
    const out: FlatItem[] = [];
    for (const o of groups.orders) {
      out.push({
        key: `o-${o.id}`,
        group: t.orders,
        title: `${o.number} · ${o.businessName}`,
        sub: `${ORDER_STATUS_LABEL[o.status]}${o.customerName ? ` · ${o.customerName}` : ""}`,
        badge: formatAmount(o.finalPrice, currency),
        run: () => onOpenOrder(o.id),
      });
    }
    for (const p of groups.products) {
      out.push({
        key: `p-${p.slug}`,
        group: t.products,
        title: p.name,
        sub: `${p.category || "—"} · ${p.status}`,
        badge: formatAmount(p.sellPriceEur, currency),
        run: () => onOpenProduct(p.slug),
      });
    }
    for (const b of groups.businesses) {
      out.push({
        key: `b-${b.label}`,
        group: t.gsBusinessTypes,
        title: b.label,
        sub: t.gsOrdersCount.replace("{n}", String(b.count)),
        run: () => onSeedOrders(b.label),
      });
    }
    for (const c of groups.customers) {
      out.push({
        key: `c-${c.name}`,
        group: t.gsCustomers,
        title: c.name,
        sub: t.gsOrdersCount.replace("{n}", String(c.count)),
        run: () => onSeedOrders(c.name),
      });
    }
    return out;
  }, [groups, currency, onOpenOrder, onOpenProduct, onSeedOrders]);

  useEffect(() => setActive(0), [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") return onClose();
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  // Keep the highlighted row in view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} aria-hidden />
      <div className="rise-in relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="text-muted" aria-hidden>
            🔎
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t.gsPlaceholder}
            className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[0.65rem] text-faint">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {query.trim() === "" ? (
            <p className="px-4 py-8 text-center text-sm text-faint">{t.gsHint}</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-faint">{t.gsNoResults}</p>
          ) : (
            items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.key}>
                  {header && (
                    <p className="px-4 pb-1 pt-3 text-[0.64rem] font-semibold uppercase tracking-wider text-faint">
                      {header}
                    </p>
                  )}
                  <button
                    type="button"
                    data-idx={i}
                    onMouseEnter={() => setActive(i)}
                    onClick={item.run}
                    className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left ${
                      i === active ? "bg-accent-soft" : "hover:bg-surface-2"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{item.title}</span>
                      <span className="block truncate text-[0.72rem] text-faint">{item.sub}</span>
                    </span>
                    {item.badge && <span className="shrink-0 text-sm font-semibold tnum text-accent">{item.badge}</span>}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
