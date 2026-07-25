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
  createProduct,
  deleteProduct,
  duplicateProduct,
  reorderProducts,
  bulkUpdateProducts,
  bulkDeleteProducts,
  getOwnerSettings,
  updateOwnerSettings,
} from "@/lib/data/owner-catalog";
import { recommendPrice, type PriceOverrides } from "@/lib/pricing";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { t } from "@/lib/i18n";
import type { OwnerProduct, OwnerProductPatch } from "@/lib/data/catalog-types";
import DashboardHeader, { type OwnerNav } from "@/components/dashboard/DashboardHeader";
import ProductCatalog from "@/components/ProductCatalog";
import BundleBuilder from "@/components/BundleBuilder";
import BusinessPresets from "@/components/BusinessPresets";
import SettingsPanel from "@/components/SettingsPanel";
import OrderList from "@/components/OrderList";
import OrderDetail from "@/components/OrderDetail";
import ClientOrderView from "@/components/ClientOrderView";
import DashboardHome from "@/components/dashboard/DashboardHome";
import AnalyticsView from "@/components/dashboard/AnalyticsView";
import ProductManager, { type ProductManagerHandlers } from "@/components/dashboard/ProductManager";
import GlobalSearch from "@/components/dashboard/GlobalSearch";
import NotificationCenter from "@/components/dashboard/NotificationCenter";
import {
  getNotifications,
  createNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification as deleteNotificationRemote,
} from "@/lib/data/notifications";
import { computeAdvisoryNotifications } from "@/lib/notifications-advisory";
import type { AppNotification } from "@/lib/data/notification-types";

const DEFAULT_SETTINGS: Settings = {
  currency: DEFAULT_CURRENCY,
  minMargin: 0.7,
  minProfit: 3,
  bundleDiscount: 0.1,
  businessName: "",
  logoUrl: "",
};
const defaultSel = () => ({ selection: { ...bundles[0].kit }, activePreset: bundles[0].id as string | null });

type OwnerView = "home" | "analytics" | "catalog" | "builder" | "orders" | "detail" | "clientPreview";

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
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const settingsNotifiedRef = useRef<string>("");

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [ownerView, setOwnerView] = useState<OwnerView>("home");
  // Deep-link seeds for search results (remounted via seedNonce to re-apply).
  const [orderQuerySeed, setOrderQuerySeed] = useState("");
  const [catalogEditSlug, setCatalogEditSlug] = useState<string | null>(null);
  const [seedNonce, setSeedNonce] = useState(0);
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive the builder's view of the catalog from the authoritative rows.
  // Only ACTIVE products are sellable in the builder; drafts/archived are hidden
  // here but remain fully manageable in the Products view.
  const products = useMemo(() => ownerProducts.filter((op) => op.isActive).map(toProduct), [ownerProducts]);
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

    Promise.all([getOwnerProducts(), getOwnerSettings(), getOrders(), getNotifications()]).then(
      async ([pRes, sRes, oRes, nRes]) => {
        const nextSettings: Settings = sRes.ok
          ? {
              currency: sRes.settings.currency,
              minMargin: sRes.settings.minMargin,
              minProfit: sRes.settings.minProfit,
              bundleDiscount: sRes.settings.bundleDiscount,
              businessName: sRes.settings.businessName,
              logoUrl: sRes.settings.logoUrl,
            }
          : DEFAULT_SETTINGS;
        if (sRes.ok) setSettings(nextSettings);
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

        // Notifications: start from what's stored, then sync advisory items
        // (deduped server-side) derived from the current catalog.
        let notifs = nRes.ok ? nRes.notifications : [];
        if (pRes.ok && sRes.ok) {
          const advisories = computeAdvisoryNotifications(pRes.products, nextSettings);
          if (advisories.length > 0) {
            const cRes = await createNotifications(advisories);
            if (cRes.ok) notifs = cRes.notifications;
          }
        }
        setNotifications(notifs);
        setHydrated(true);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the ephemeral builder selection persists locally.
  useEffect(() => {
    if (hydrated) saveJSON(KEYS.selection, { selection, activePreset });
  }, [selection, activePreset, hydrated]);

  // Global search shortcut: Ctrl/Cmd+K anywhere, or "/" when not typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showToast = (msg: string, ms = 2800) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  };

  const reportError = (detail: string) => {
    console.error("[owner]", detail);
    showToast(t.saveError);
  };

  // ---- navigation (also used by global search deep-links) ----
  const goOrders = (q = "") => {
    setOrderQuerySeed(q);
    setSeedNonce((n) => n + 1);
    setOwnerView("orders");
  };
  const goCatalog = (editSlug: string | null = null) => {
    setCatalogEditSlug(editSlug);
    setSeedNonce((n) => n + 1);
    setOwnerView("catalog");
  };
  const openOrderById = (id: string) => {
    setCurrentOrderId(id);
    setOwnerView("detail");
    setSearchOpen(false);
  };
  const navigate = (view: OwnerNav) => {
    if (view === "catalog") goCatalog();
    else if (view === "orders") goOrders();
    else setOwnerView(view);
  };

  // ---- notifications ----
  const markAllRead = async () => {
    setNotifications((list) => list.map((n) => ({ ...n, read: true })));
    const res = await markAllNotificationsRead();
    if (!res.ok) reportError(res.error);
  };
  const removeNotification = async (id: string) => {
    const prev = notifications;
    setNotifications((list) => list.filter((n) => n.id !== id));
    const res = await deleteNotificationRemote(id);
    if (!res.ok) {
      setNotifications(prev);
      reportError(res.error);
    }
  };
  const openNotification = (n: AppNotification) => {
    if (!n.read) {
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markNotificationRead(n.id).then((r) => !r.ok && console.error("[owner]", r.error));
    }
    const slug = typeof n.meta?.slug === "string" ? n.meta.slug : null;
    const orderId = typeof n.meta?.orderId === "string" ? n.meta.orderId : null;
    if (n.type === "new_order") {
      if (orderId && store.orders.some((o) => o.id === orderId)) {
        setCurrentOrderId(orderId);
        setOwnerView("detail");
      } else {
        goOrders();
      }
    } else if (n.type === "settings_changed") {
      setSettingsOpen(true);
    } else if (slug) {
      goCatalog(slug);
    }
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
      businessName: next.businessName ?? "",
      logoUrl: next.logoUrl ?? "",
    });
    if (!res.ok) {
      setSettings(prev);
      reportError(res.error);
      return;
    }
    // Raise a single "settings changed" notification per day (deduped server-side).
    const today = new Date().toISOString().slice(0, 10);
    if (settingsNotifiedRef.current !== today) {
      settingsNotifiedRef.current = today;
      createNotifications([
        {
          type: "settings_changed",
          title: t.notifSettingsChanged,
          body: t.notifSettingsBody,
          dedupeKey: `settings:${today}`,
        },
      ]).then((r) => r.ok && setNotifications(r.notifications));
    }
  };

  // ---- product management (Products view) — persist to Supabase (owner session) ----
  const pmHandlers: ProductManagerHandlers = {
    onCreate: async (patch) => {
      const res = await createProduct(patch);
      if (!res.ok) return reportError(res.error), false;
      setOwnerProducts((list) => [...list, res.product]);
      showToast(t.pmSaved);
      return true;
    },
    onUpdate: async (slug, patch) => {
      const res = await updateProduct(slug, patch);
      if (!res.ok) return reportError(res.error), false;
      setOwnerProducts((list) => list.map((op) => (op.slug === slug ? res.product : op)));
      return true;
    },
    onDuplicate: async (slug) => {
      const res = await duplicateProduct(slug);
      if (!res.ok) return reportError(res.error), false;
      setOwnerProducts((list) => [...list, res.product]);
      showToast(t.pmSaved);
      return true;
    },
    onDelete: async (slug) => {
      const prev = ownerProducts;
      setOwnerProducts((list) => list.filter((op) => op.slug !== slug));
      const res = await deleteProduct(slug);
      if (!res.ok) {
        setOwnerProducts(prev);
        return reportError(res.error), false;
      }
      return true;
    },
    onReorder: async (slugs) => {
      const prev = ownerProducts;
      const orderMap = new Map(slugs.map((s, i) => [s, i]));
      setOwnerProducts((list) =>
        [...list]
          .map((op) => (orderMap.has(op.slug) ? { ...op, sortOrder: orderMap.get(op.slug)! } : op))
          .sort((a, b) => a.sortOrder - b.sortOrder)
      );
      const res = await reorderProducts(slugs);
      if (!res.ok) {
        setOwnerProducts(prev);
        return reportError(res.error), false;
      }
      return true;
    },
    onBulkUpdate: async (slugs, patch) => {
      const res = await bulkUpdateProducts(slugs, patch);
      if (!res.ok) return reportError(res.error), false;
      setOwnerProducts((list) => list.map((op) => res.products.find((r) => r.slug === op.slug) ?? op));
      return true;
    },
    onBulkDelete: async (slugs) => {
      const prev = ownerProducts;
      const set = new Set(slugs);
      setOwnerProducts((list) => list.filter((op) => !set.has(op.slug)));
      const res = await bulkDeleteProducts(slugs);
      if (!res.ok) {
        setOwnerProducts(prev);
        return reportError(res.error), false;
      }
      return true;
    },
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

  return (
    <>
      <Toast msg={toast} />
      <main className="mx-auto max-w-6xl px-4 py-7 pb-24 lg:pb-7">
        <DashboardHeader
          brandName={settings.businessName}
          logoUrl={settings.logoUrl}
          subtitle={t.ownerMode}
          activeView={ownerView}
          onNavigate={navigate}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          notificationSlot={
            <NotificationCenter
              notifications={notifications}
              currency={settings.currency}
              onMarkAllRead={markAllRead}
              onOpen={openNotification}
              onDelete={removeNotification}
            />
          }
        />

        {!hydrated && <DashboardHome loading orders={[]} products={[]} currency={settings.currency} onNewOrder={() => {}} onViewOrders={() => {}} onOpenOrder={() => {}} />}

        {hydrated && ownerView === "home" && (
          <DashboardHome
            orders={store.orders}
            products={ownerProducts}
            currency={settings.currency}
            onNewOrder={() => setOwnerView("builder")}
            onViewOrders={() => goOrders()}
            onOpenOrder={(id) => {
              setCurrentOrderId(id);
              setOwnerView("detail");
            }}
            onViewAnalytics={() => setOwnerView("analytics")}
          />
        )}

        {hydrated && ownerView === "analytics" && (
          <AnalyticsView orders={store.orders} products={ownerProducts} currency={settings.currency} />
        )}

        {hydrated && ownerView === "catalog" && (
          <ProductManager
            key={`catalog-${seedNonce}`}
            products={ownerProducts}
            settings={settings}
            handlers={pmHandlers}
            initialEditSlug={catalogEditSlug}
          />
        )}

        {hydrated && ownerView === "builder" && (
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

        {hydrated && ownerView === "orders" && (
          <OrderList
            key={`orders-${seedNonce}`}
            orders={store.orders}
            initialQuery={orderQuerySeed}
            onOpen={(id) => {
              setCurrentOrderId(id);
              setOwnerView("detail");
            }}
            onExport={exportData}
            onImportFile={importData}
          />
        )}

        {hydrated && ownerView === "detail" && currentOrder && (
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

        {hydrated && ownerView === "clientPreview" && currentOrder && (
          <ClientOrderView order={currentOrder} onBack={() => setOwnerView("detail")} backLabel={currentOrder.number} />
        )}

        <SettingsPanel
          settings={settings}
          onChange={updateSettings}
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onExport={exportData}
          onImportFile={importData}
        />
      </main>

      {/* Bottom tab bar — primary navigation below lg, where the header nav is hidden. */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-surface/95 backdrop-blur lg:hidden">
        <MobileTab label={t.dashboardHome} icon="🏠" active={ownerView === "home"} onClick={() => setOwnerView("home")} />
        <MobileTab label={t.analytics} icon="📊" active={ownerView === "analytics"} onClick={() => setOwnerView("analytics")} />
        <MobileTab label={t.products} icon="📦" active={ownerView === "catalog"} onClick={() => goCatalog()} />
        <MobileTab label={t.builder} icon="🧩" active={ownerView === "builder"} onClick={() => setOwnerView("builder")} />
        <MobileTab
          label={t.orders}
          icon="🧾"
          active={ownerView === "orders" || ownerView === "detail"}
          onClick={() => goOrders()}
        />
      </nav>

      {searchOpen && (
        <GlobalSearch
          orders={store.orders}
          products={ownerProducts}
          currency={settings.currency}
          onOpenOrder={openOrderById}
          onOpenProduct={(slug) => {
            goCatalog(slug);
            setSearchOpen(false);
          }}
          onSeedOrders={(q) => {
            goOrders(q);
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </>
  );
}

/** True when a keyboard event target is an editable field (so "/" types normally). */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
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

function MobileTab({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.62rem] font-medium transition ${
        active ? "text-accent" : "text-faint hover:text-muted"
      }`}
    >
      <span className={`text-lg leading-none ${active ? "scale-110" : ""} transition-transform`} aria-hidden>
        {icon}
      </span>
      <span className="truncate">{label}</span>
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
