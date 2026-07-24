"use client";

import { useEffect, useRef, useState } from "react";
import { products } from "@/data/products";
import { bundles } from "@/data/bundles";
import type { AppMode, OrderSnapshot, OrderStore, Settings } from "@/types";
import { KEYS, loadJSON, saveJSON } from "@/lib/storage";
import {
  buildBackup,
  buildOrder,
  duplicateOrder,
  isValidBackup,
  refreezeOrder,
  selectionFromOrder,
  type OrderFormInput,
} from "@/lib/orders";
import {
  getOrders,
  adminCreateOrder,
  updateOrder as updateOrderRemote,
  deleteOrder as deleteOrderRemote,
  replaceAllOrders,
} from "@/lib/data/orders";
import { createPublicOrder } from "@/lib/data/public-orders";
import type { PriceOverrides } from "@/lib/pricing";
import { DEFAULT_CURRENCY } from "@/lib/currency";
import { t } from "@/lib/i18n";
import AppHeader from "@/components/AppHeader";
import ProductCatalog from "@/components/ProductCatalog";
import BundleBuilder from "@/components/BundleBuilder";
import BusinessPresets from "@/components/BusinessPresets";
import SettingsPanel from "@/components/SettingsPanel";
import CloseOrderForm from "@/components/CloseOrderForm";
import OrderList from "@/components/OrderList";
import OrderDetail from "@/components/OrderDetail";
import ClientOrderView from "@/components/ClientOrderView";

const DEFAULT_SETTINGS: Settings = {
  currency: DEFAULT_CURRENCY,
  minMargin: 0.7,
  minProfit: 3,
  bundleDiscount: 0.1,
};
const defaultCosts = (): Record<string, number> => Object.fromEntries(products.map((p) => [p.id, p.defaultCost]));
const defaultSel = () => ({ selection: { ...bundles[0].kit }, activePreset: bundles[0].id as string | null });

type OwnerView = "builder" | "orders" | "detail" | "clientPreview";
type ClientView = "builder" | "saved";

/**
 * The whole application. Rendered by exactly two routes:
 *   "/"          -> mode="client"  (the public website)
 *   "/dashboard" -> mode="owner"   (private, never linked from the public site)
 */
export default function NfcApp({ mode }: { mode: Exclude<AppMode, "select"> }) {
  const [hydrated, setHydrated] = useState(false);

  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [costs, setCosts] = useState<Record<string, number>>(defaultCosts);
  // Owner price overrides ("Çmimi im"). Empty = use the engine recommendation.
  const [prices, setPrices] = useState<PriceOverrides>({});
  const [selection, setSelection] = useState<Record<string, number>>(() => ({ ...bundles[0].kit }));
  const [activePreset, setActivePreset] = useState<string | null>(bundles[0].id);
  const [store, setStore] = useState<OrderStore>({ version: 1, counter: 0, orders: [] });

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ownerView, setOwnerView] = useState<OwnerView>("builder");
  const [clientView, setClientView] = useState<ClientView>("builder");
  const [currentOrderId, setCurrentOrderId] = useState<string | null>(null);
  // The just-created order for the public receipt. The public site never loads
  // the order list, so the receipt renders from this in-memory snapshot.
  const [clientReceipt, setClientReceipt] = useState<OrderSnapshot | null>(null);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [closeFormOpen, setCloseFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const savingRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSettings(loadJSON(KEYS.settings, DEFAULT_SETTINGS));
    setCosts(loadJSON(KEYS.costs, defaultCosts()));
    setPrices(loadJSON<PriceOverrides>(KEYS.prices, {}));
    const sel = loadJSON(KEYS.selection, defaultSel());
    setSelection(sel.selection ?? { ...bundles[0].kit });
    setActivePreset(sel.activePreset ?? bundles[0].id);

    // Orders live in Supabase now. Only the owner dashboard loads the full list;
    // the public site never reads orders (it can only create one).
    if (mode === "owner") {
      getOrders().then((res) => {
        if (res.ok) setStore({ version: 1, counter: 0, orders: res.orders });
        else {
          console.error("[orders] load:", res.error);
          showToast(t.loadError);
        }
        setHydrated(true);
      });
    } else {
      setHydrated(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated) saveJSON(KEYS.settings, settings);
  }, [settings, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(KEYS.costs, costs);
  }, [costs, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(KEYS.prices, prices);
  }, [prices, hydrated]);
  useEffect(() => {
    if (hydrated) saveJSON(KEYS.selection, { selection, activePreset });
  }, [selection, activePreset, hydrated]);

  // The public site is always quoted in ALL. Only the dashboard can switch.
  const viewSettings: Settings =
    mode === "client" && settings.currency !== DEFAULT_CURRENCY
      ? { ...settings, currency: DEFAULT_CURRENCY }
      : settings;

  const showToast = (msg: string, ms = 2800) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  };

  // ---- builder handlers ----
  const setCost = (id: string, value: number) => setCosts((c) => ({ ...c, [id]: value }));
  /** null clears the override and falls back to the recommended price. */
  const setPrice = (id: string, value: number | null) =>
    setPrices((p) => {
      const next = { ...p };
      if (value === null) delete next[id];
      else next[id] = value;
      return next;
    });
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

  // ---- order handlers ----
  // Surface a failed persistence op: friendly toast for the user, full detail
  // for the developer (the app never loses an order silently).
  const reportError = (detail: string) => {
    console.error("[orders]", detail);
    showToast(t.saveError);
  };
  const replaceInStore = (o: OrderSnapshot) =>
    setStore((s) => ({ ...s, orders: s.orders.map((x) => (x.id === o.id ? o : x)) }));

  const openCloseForm = () => {
    savingRef.current = false;
    setSaving(false);
    setCloseFormOpen(true);
  };

  const finalizeOrder = async (form: OrderFormInput) => {
    if (savingRef.current) return; // prevent duplicate submissions
    savingRef.current = true;
    setSaving(true);
    const preset = bundles.find((b) => b.id === activePreset);
    // Financials are computed client-side exactly as before; the number/id are
    // assigned by the database (see create_public_order).
    const draft = buildOrder(
      form,
      activePreset ?? "custom",
      preset?.name ?? t.customBundle,
      selection,
      products,
      costs,
      viewSettings,
      store.counter + 1,
      prices
    );
    const res = await createPublicOrder(draft);
    savingRef.current = false;
    if (!res.ok) {
      setSaving(false);
      reportError(res.error);
      return; // keep the form open so the customer can retry
    }
    const saved: OrderSnapshot = {
      ...draft,
      id: res.created.id,
      number: res.created.number,
      createdAt: res.created.createdAt || draft.createdAt,
      updatedAt: res.created.createdAt || draft.updatedAt,
    };
    setCloseFormOpen(false);
    setSaving(false);
    setClientReceipt(saved);
    setClientView("saved");
    // The receipt page opens first; the toast confirms it there for ~2s.
    showToast(t.orderSavedSuccess, 2000);
  };

  // Optimistic: update the UI immediately (keeps the status-tracker animation
  // instant), then persist. On failure, roll back and report.
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
    replaceInStore(updated);
    setEditingOrderId(null);
    setCurrentOrderId(updated.id);
    setOwnerView("detail");
    const res = await updateOrderRemote(updated);
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
    const created = duplicateOrder(refreezeOrder(existing, selection, products, costs, settings, prices), store.counter + 1);
    const res = await adminCreateOrder(created);
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
        // Settings/costs/prices/selection stay local (owner config); only the
        // orders are restored into Supabase (destructive full replace).
        setSettings(obj.settings);
        setCosts(obj.costs);
        setPrices(obj.prices ?? {});
        setSelection(obj.selection ?? {});
        setActivePreset(null);
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
  const presetName = bundles.find((b) => b.id === activePreset)?.name ?? t.customBundle;

  if (!hydrated) return null;

  // ---------------- OWNER (/dashboard) ----------------
  if (mode === "owner") {
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
            <OrderList orders={store.orders} onOpen={(id) => { setCurrentOrderId(id); setOwnerView("detail"); }} onExport={exportData} onImportFile={importData} />
          )}

          {ownerView === "detail" && currentOrder && (
            <OrderDetail
              order={currentOrder}
              onBack={() => setOwnerView("orders")}
              onUpdate={updateOrder}
              onDuplicate={duplicate}
              onDelete={deleteOrder}
              onOpenClientView={(o) => { setCurrentOrderId(o.id); setOwnerView("clientPreview"); }}
              onEdit={editOrder}
            />
          )}

          {ownerView === "clientPreview" && currentOrder && (
            <ClientOrderView order={currentOrder} onBack={() => setOwnerView("detail")} backLabel={currentOrder.number} />
          )}

          <SettingsPanel settings={settings} onChange={setSettings} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </main>
      </>
    );
  }

  // ---------------- CLIENT (public "/") ----------------
  return (
    <>
      <Toast msg={toast} />
      <main className="mx-auto max-w-6xl px-4 py-7">
        <AppHeader subtitle={t.tagline} />

        {clientView === "builder" && (
          <>
            <BusinessTypeSection activePreset={activePreset} onSelect={loadPreset} />
            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
              <ProductCatalog
                products={products}
                costs={costs}
                prices={prices}
                settings={viewSettings}
                selection={selection}
                variant="client"
                onCostChange={setCost}
                onPriceChange={setPrice}
                onToggle={toggle}
              />
              <div className="lg:sticky lg:top-4">
                <BundleBuilder
                  products={products}
                  costs={costs}
                  prices={prices}
                  settings={viewSettings}
                  selection={selection}
                  presets={bundles}
                  activePreset={activePreset}
                  variant="client"
                  onQty={setQty}
                  onReset={() => activePreset && loadPreset(activePreset)}
                  onCloseOrder={openCloseForm}
                />
              </div>
            </div>
          </>
        )}

        {clientView === "saved" && clientReceipt && (
          <ClientOrderView
            order={clientReceipt}
            onBack={() => setClientView("builder")}
            backLabel={t.buildAnother}
            confirmation
          />
        )}

        <CloseOrderForm
          open={closeFormOpen}
          defaultBusinessName={presetName}
          saving={saving}
          onCancel={() => setCloseFormOpen(false)}
          onConfirm={finalizeOrder}
        />
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
