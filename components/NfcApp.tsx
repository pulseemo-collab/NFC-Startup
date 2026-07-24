"use client";

// The OWNER dashboard ("/dashboard"). Auth-gated (middleware + RLS), so it is the
// ONLY place private data (supplier costs, margins, the pricing engine) is loaded.
// The public site uses a separate, leak-free tree (components/public/PublicApp).
//
// Product catalog, supplier costs and owner settings now come from Supabase (owner
// data layer), not localStorage. Only the ephemeral builder selection stays local.
// The pricing engine still runs client-side here — that is fine, the owner is
// authorized to see costs/margins, and this code never ships to the public bundle.

import { useEffect, useMemo, useRef, useState } from "react";
import { bundles } from "@/data/bundles";
import type { OrderSnapshot, OrderStore, Product, Settings } from "@/types";
import { KEYS, loadJSON, saveJSON } from "@/lib/storage";
import {
  buildBackup,
  duplicateOrder,
  isValidBackup,
  refreezeOrder,
  selectionFromOrder,
} from "@/lib/orders";
import {
  getOrders,
  adminCreateOrder,
  updateOrder as updateOrderRemote,
  deleteOrder as deleteOrderRemote,
  replaceAllOrders,
} from "@/lib/data/orders";
import {
  getOwnerProducts,
  updateProduct,
  getOwnerSettings,
  updateOwnerSettings,
} from "@/lib/data/owner-catalog";
import { recommendPrice, type PriceOverrides } from "@/lib/pricing";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { t } from "@/lib/i18n";
import type { OwnerProduct } from "@/lib/data/catalog-types";
import AppHeader from "@/components/AppHeader";
import ProductCatalog from "@/components/ProductCatalog";
import BundleBuilder from "@/components/BundleBuilder";
import BusinessPresets from "@/components/BusinessPresets";
import SettingsPanel from "@/components/SettingsPanel";
import OrderList from "@/components/OrderList";
import OrderDetail from "@/components/OrderDetail";
import ClientOrderView from "@/components/ClientOrderView";

const DEFAULT_SETTINGS: Settings = {
  currency: DEFAULT_CURRENCY,
  minMargin: 0.7,
  minProfit: 3,
  bundleDiscount: 0.1,
};
const defaultSel = () => ({ selection: { ...bundles[0].kit }, activePreset: bundles[0].id as string | null });

type OwnerView = "builder" | "orders" | "detail" | "clientPreview";

/** OwnerProduct (DB shape) -> the Product shape the builder components expect. */
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

export default function NfcApp() {
  const [hydrated, setHydrated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  // Authoritative product catalog from Supabase (owner-only, incl. private fields).
  const [ownerProducts, setOwnerProducts] = useState<OwnerProduct[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [selection, setSelection] = useState<Record<string, number>>(() => ({ ...bundles[0].kit }));
  const [activePreset, setActivePreset] = useState<string | null>(bundles[0].id);
  const [store, setStore] = useState<OrderStore>({ version: 1, counter: 0, orders: [] });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ownerView, setOwnerView] = useState<OwnerView>("builder");
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive the builder's view of the catalog from the authoritative rows.
  const products = useMemo(() => ownerProducts.map(toProduct), [ownerProducts]);
  const costs = useMemo(
    () => Object.fromEntries(ownerProducts.map((op) => [op.slug, op.supplierCostEur])),
    [ownerProducts]
  );
  // "Overrides" = a stored sell price that differs from the current recommendation.
  // This reproduces the previous UI (accent price + "use recommended" reset) while
  // keeping the DB sell_price_eur authoritative for orders + the public site.
  const prices: PriceOverrides = useMemo(() => {
    const m: PriceOverrides = {};
    for (const op of ownerProducts) {
      const rec = recommendPrice(toProduct(op), op.supplierCostEur, settings).price;
      if (op.sellPriceEur !== rec) m[op.slug] = op.sellPriceEur;
    }
    return m;
  }, [ownerProducts, settings]);

  useEffect(() => {
    const sel = loadJSON(KEYS.selection, defaultSel());
    setSelection(sel.selection ?? { ...bundles[0].kit });
    setActivePreset(sel.activePreset ?? bundles[0].id);

    Promise.all([getOwnerProducts(), getOwnerSettings(), getOrders()]).then(([pRes, sRes, oRes]) => {
      if (sRes.ok) {
        setSettings({
          currency: sRes.settings.currency,
          minMargin: sRes.settings.minMargin,
          minProfit: sRes.settings.minProfit,
          bundleDiscount: sRes.settings.bundleDiscount,
        });
      }
      if (pRes.ok) setOwnerProducts(pRes.products);
      else {
        console.error("[owner] products:", pRes.error);
        setLoadFailed(true);
        showToast(t.productsLoadError);
      }
      if (oRes.ok) setStore({ version: 1, counter: 0, orders: oRes.orders });
      else {
        console.error("[owner] orders:", oRes.error);
        showToast(t.loadError);
      }
      setHydrated(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the ephemeral builder selection persists locally.
  useEffect(() => {
    if (hydrated) saveJSON(KEYS.selection, { selection, activePreset });
  }, [selection, activePreset, hydrated]);

  const showToast = (msg: string, ms = 2800) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  };

  const reportError = (detail: string) => {
    console.error("[owner]", detail);
    showToast(t.saveError);
  };

  const productBySlug = (slug: string): Product | null => {
    const op = ownerProducts.find((p) => p.slug === slug);
    return op ? toProduct(op) : null;
  };
  const patchOwnerProduct = (slug: string, patch: Partial<OwnerProduct>) =>
    setOwnerProducts((list) => list.map((op) => (op.slug === slug ? { ...op, ...patch } : op)));

  // ---- catalog edits (persist to Supabase, optimistic + rollback) ----
  // Editing the cost keeps the sell price in sync: if the product is tracking the
  // recommendation, the new recommendation is stored; an explicit price is kept.
  const setCost = async (slug: string, newCost: number) => {
    const prod = productBySlug(slug);
    if (!prod) return;
    const override = prices[slug] ?? null;
    const effectiveSell = override ?? recommendPrice(prod, newCost, settings).price;
    const prev = ownerProducts;
    patchOwnerProduct(slug, { supplierCostEur: newCost, sellPriceEur: effectiveSell });
    const res = await updateProduct(slug, { supplierCostEur: newCost, sellPriceEur: effectiveSell });
    if (!res.ok) {
      setOwnerProducts(prev);
      reportError(res.error);
    } else {
      setOwnerProducts((list) => list.map((op) => (op.slug === slug ? res.product : op)));
    }
  };

  /** null clears the override -> store the current recommendation. */
  const setPrice = async (slug: string, value: number | null) => {
    const prod = productBySlug(slug);
    if (!prod) return;
    const cost = costs[slug] ?? prod.defaultCost;
    const effectiveSell = value === null ? recommendPrice(prod, cost, settings).price : value;
    const prev = ownerProducts;
    patchOwnerProduct(slug, { sellPriceEur: effectiveSell });
    const res = await updateProduct(slug, { sellPriceEur: effectiveSell });
    if (!res.ok) {
      setOwnerProducts(prev);
      reportError(res.error);
    } else {
      setOwnerProducts((list) => list.map((op) => (op.slug === slug ? res.product : op)));
    }
  };

  const updateSettings = async (next: Settings) => {
    const prev = settings;
    setSettings(next);
    const res = await updateOwnerSettings({
      currency: next.currency,
      minMargin: next.minMargin,
      minProfit: next.minProfit,
      bundleDiscount: next.bundleDiscount,
    });
    if (!res.ok) {
      setSettings(prev);
      reportError(res.error);
    }
  };

  // ---- builder selection (local only) ----
  const setQty = (id: string, qty: number) =>
    setSelection((s) => {
      const next = { ...s };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  const toggle = (id: string) =>
    setSelection((s) => {
      const next = { ...s };
      if (next[id]) delete next[id];
      else next[id] = 1;
      return next;
    });
  const loadPreset = (id: string) => {
    const b = bundles.find((x) => x.id === id);
    if (b) {
      setSelection({ ...b.kit });
      setActivePreset(id);
      showToast(`✓ ${t.presetLoaded}`);
    }
  };

  // ---- order handlers (Supabase, owner session) ----
  const replaceInStore = (o: OrderSnapshot) =>
    setStore((s) => ({ ...s, orders: s.orders.map((x) => (x.id === o.id ? o : x)) }));

  const updateOrder = async (next: OrderSnapshot) => {
    const prev = store.orders;
    replaceInStore(next);
    const res = await updateOrderRemote(next);
    if (!res.ok) {
      setStore((s) => ({ ...s, orders: prev }));
      reportError(res.error);
    } else {
      replaceInStore(res.order);
    }
  };

  const deleteOrder = async (order: OrderSnapshot) => {
    const prev = store.orders;
    setStore((s) => ({ ...s, orders: s.orders.filter((o) => o.id !== order.id) }));
    setCurrentOrderId(null);
    setOwnerView("orders");
    const res = await deleteOrderRemote(order.id);
    if (!res.ok) {
      setStore((s) => ({ ...s, orders: prev }));
      reportError(res.error);
    }
  };

  const duplicate = async (order: OrderSnapshot) => {
    const created = duplicateOrder(order, store.counter + 1);
    const res = await adminCreateOrder(created);
    if (!res.ok) {
      reportError(res.error);
      return;
    }
    setStore((s) => ({ ...s, orders: [...s.orders, res.order] }));
    setCurrentOrderId(res.order.id);
    setOwnerView("detail");
    showToast(t.orderSavedSuccess);
  };

  const editOrder = (order: OrderSnapshot) => {
    setSelection(selectionFromOrder(order));
    setActivePreset(order.businessType);
    setEditingOrderId(order.id);
    setOwnerView("builder");
  };

  const saveEditChanges = async () => {
    if (!editingOrderId) return;
    const existing = store.orders.find((o) => o.id === editingOrderId);
    if (!existing) return;
    const updated = refreezeOrder(existing, selection, products, costs, settings, prices);
    const prev = store.orders;
    setSaving(true);
    replaceInStore(updated);
    setEditingOrderId(null);
    setCurrentOrderId(updated.id);
    setOwnerView("detail");
    const res = await updateOrderRemote(updated);
    setSaving(false);
    if (!res.ok) {
      setStore((s) => ({ ...s, orders: prev }));
      reportError(res.error);
      return;
    }
    replaceInStore(res.order);
    showToast(t.orderSavedSuccess);
  };

  const saveEditAsNew = async () => {
    if (!editingOrderId) return;
    const existing = store.orders.find((o) => o.id === editingOrderId);
    if (!existing) return;
    const created = duplicateOrder(
      refreezeOrder(existing, selection, products, costs, settings, prices),
      store.counter + 1
    );
    setSaving(true);
    const res = await adminCreateOrder(created);
    setSaving(false);
    if (!res.ok) {
      reportError(res.error);
      return;
    }
    setStore((s) => ({ ...s, orders: [...s.orders, res.order] }));
    setEditingOrderId(null);
    setCurrentOrderId(res.order.id);
    setOwnerView("detail");
    showToast(t.orderSavedSuccess);
  };

  const exportData = () => {
    const backup = buildBackup(settings, costs, prices, selection, store);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nfc-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import restores ORDERS only (products + settings live in Supabase now and are
  // managed in the dashboard). Destructive full replace of orders, as before.
  const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!isValidBackup(obj)) {
          window.alert(t.importInvalid);
          return;
        }
        if (!window.confirm(t.importConfirm)) return;
        const os = obj.orders;
        const orders = Array.isArray(os.orders) ? os.orders : [];
        const res = await replaceAllOrders(orders);
        if (!res.ok) {
          reportError(res.error);
          return;
        }
        setStore({ version: 1, counter: 0, orders: res.orders });
        showToast(t.importSuccess);
      } catch {
        window.alert(t.importInvalid);
      }
    };
    reader.readAsText(file);
  };

  const currentOrder = store.orders.find((o) => o.id === currentOrderId) ?? null;
  const editingNumber = editingOrderId ? store.orders.find((o) => o.id === editingOrderId)?.number ?? null : null;

  if (!hydrated) return null;

  return (
    <>
      <Toast msg={toast} />
      <main className="mx-auto max-w-6xl px-4 py-7">
        <AppHeader subtitle={t.ownerMode}>
          <NavBtn active={ownerView === "builder"} onClick={() => setOwnerView("builder")}>
            {t.builder}
          </NavBtn>
          <NavBtn active={ownerView === "orders" || ownerView === "detail"} onClick={() => setOwnerView("orders")}>
            {t.orders}
          </NavBtn>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-accent hover:text-accent"
          >
            ⚙ {t.settings}
          </button>
          {/* Logout: server-side POST clears the Supabase session cookies. */}
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium hover:border-accent hover:text-accent"
            >
              {t.logout}
            </button>
          </form>
        </AppHeader>

        {ownerView === "builder" && (
          <>
            {loadFailed && (
              <div className="mb-5 rounded-lg border border-warn bg-warn-soft px-4 py-3 text-sm text-warn">
                {t.productsLoadError}
              </div>
            )}
            <BusinessTypeSection activePreset={activePreset} onSelect={loadPreset} />
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
              <ProductCatalog
                products={products}
                costs={costs}
                prices={prices}
                settings={settings}
                selection={selection}
                variant="owner"
                onCostChange={setCost}
                onPriceChange={setPrice}
                onToggle={toggle}
              />
              <div className="lg:sticky lg:top-4">
                <BundleBuilder
                  products={products}
                  costs={costs}
                  prices={prices}
                  settings={settings}
                  selection={selection}
                  presets={bundles}
                  activePreset={activePreset}
                  variant="owner"
                  onQty={setQty}
                  onReset={() => activePreset && loadPreset(activePreset)}
                  editingNumber={editingNumber}
                  onSaveChanges={saveEditChanges}
                  onSaveAsNew={saveEditAsNew}
                  onCancelEdit={() => setEditingOrderId(null)}
                  saving={saving}
                />
              </div>
            </div>
          </>
        )}

        {ownerView === "orders" && (
          <OrderList
            orders={store.orders}
            onOpen={(id) => {
              setCurrentOrderId(id);
              setOwnerView("detail");
            }}
            onExport={exportData}
            onImportFile={importData}
          />
        )}

        {ownerView === "detail" && currentOrder && (
          <OrderDetail
            order={currentOrder}
            onBack={() => setOwnerView("orders")}
            onUpdate={updateOrder}
            onDuplicate={duplicate}
            onDelete={deleteOrder}
            onOpenClientView={(o) => {
              setCurrentOrderId(o.id);
              setOwnerView("clientPreview");
            }}
            onEdit={editOrder}
          />
        )}

        {ownerView === "clientPreview" && currentOrder && (
          <ClientOrderView order={currentOrder} onBack={() => setOwnerView("detail")} backLabel={currentOrder.number} />
        )}

        <SettingsPanel settings={settings} onChange={updateSettings} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </main>
    </>
  );
}

function BusinessTypeSection({
  activePreset,
  onSelect,
}: {
  activePreset: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="mb-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{t.businessType}</p>
      <BusinessPresets presets={bundles} activePreset={activePreset} onSelect={onSelect} />
      <p className="mt-2 text-[0.78rem] text-faint">{t.businessTypeHelp}</p>
    </section>
  );
}

function NavBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-3 py-2 text-sm font-medium transition ${
        active ? "border-accent bg-accent text-white" : "border-border bg-surface text-muted hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </button>
  );
}

function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="toast-in fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-lg border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      {msg}
    </div>
  );
}
