"use client";

// The PUBLIC website ("/"). This is a deliberately separate client tree from the
// owner dashboard (components/NfcApp.tsx). Its ENTIRE import graph excludes
// supplier costs, the pricing engine (lib/pricing.ts), and lib/orders — so none
// of that can ship in the public browser bundle.
//
// Products + config come from Supabase via public (definer) functions that return
// public columns only. The bundle price shown is a live estimate; the customer
// order is priced authoritatively server-side (create_validated_public_order).

import { useEffect, useRef, useState } from "react";
import { bundles } from "@/data/bundles";
import { t } from "@/lib/i18n";
import AppHeader from "@/components/AppHeader";
import BusinessPresets from "@/components/BusinessPresets";
import CloseOrderForm from "@/components/CloseOrderForm";
import ClientOrderView from "@/components/ClientOrderView";
import PublicProductCatalog from "@/components/public/PublicProductCatalog";
import PublicBundleBuilder from "@/components/public/PublicBundleBuilder";
import { getPublicProducts, getPublicConfig } from "@/lib/data/public-catalog";
import { createValidatedPublicOrder } from "@/lib/data/public-orders";
import type { PublicProduct, PublicConfig, PublicReceipt } from "@/lib/data/catalog-types";

type ClientView = "builder" | "saved";
type OrderForm = {
  businessName: string;
  customerName?: string;
  phone?: string;
  address?: string;
  customerNotes?: string;
};

const DEFAULT_CONFIG: PublicConfig = { currency: "ALL", bundleDiscount: 0.1 };

export default function PublicApp() {
  const [hydrated, setHydrated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG);
  const [selection, setSelection] = useState<Record<string, number>>(() => ({ ...bundles[0].kit }));
  const [activePreset, setActivePreset] = useState<string | null>(bundles[0].id);

  const [clientView, setClientView] = useState<ClientView>("builder");
  const [clientReceipt, setClientReceipt] = useState<PublicReceipt | null>(null);
  const [closeFormOpen, setCloseFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const savingRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Promise.all([getPublicProducts(), getPublicConfig()]).then(([prodRes, cfgRes]) => {
      if (prodRes.ok) setProducts(prodRes.products);
      if (cfgRes.ok) setConfig(cfgRes.config);
      if (!prodRes.ok || !cfgRes.ok) {
        console.error("[public] load:", !prodRes.ok ? prodRes.error : "", !cfgRes.ok ? cfgRes.error : "");
        setLoadFailed(true);
      }
      setHydrated(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showToast = (msg: string, ms = 2800) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  };

  const loadPreset = (id: string) => {
    const b = bundles.find((x) => x.id === id);
    if (b) {
      setSelection({ ...b.kit });
      setActivePreset(id);
      showToast(`✓ ${t.presetLoaded}`);
    }
  };
  const toggle = (slug: string) =>
    setSelection((s) => {
      const next = { ...s };
      if (next[slug]) delete next[slug];
      else next[slug] = 1;
      return next;
    });
  const setQty = (slug: string, qty: number) =>
    setSelection((s) => {
      const next = { ...s };
      if (qty <= 0) delete next[slug];
      else next[slug] = qty;
      return next;
    });

  const openCloseForm = () => {
    savingRef.current = false;
    setSaving(false);
    setCloseFormOpen(true);
  };

  const finalizeOrder = async (form: OrderForm) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    const preset = bundles.find((b) => b.id === activePreset);
    const validSlugs = new Set(products.map((p) => p.slug));
    const items = Object.entries(selection)
      .filter(([slug, qty]) => qty > 0 && validSlugs.has(slug))
      .map(([slug, qty]) => ({ slug, qty }));

    // The browser sends ONLY selections + customer info. No prices/totals.
    const res = await createValidatedPublicOrder({
      currency: config.currency,
      businessType: activePreset ?? "custom",
      businessTypeLabel: preset?.name ?? t.customBundle,
      businessName: form.businessName,
      customerName: form.customerName,
      phone: form.phone,
      address: form.address,
      customerNotes: form.customerNotes,
      items,
    });

    savingRef.current = false;
    if (!res.ok) {
      setSaving(false);
      console.error("[public] order:", res.error);
      showToast(t.saveError);
      return; // keep the form open so the customer can retry
    }
    setCloseFormOpen(false);
    setSaving(false);
    setClientReceipt(res.receipt);
    setClientView("saved");
    showToast(t.orderSavedSuccess, 2000);
  };

  const presetName = bundles.find((b) => b.id === activePreset)?.name ?? t.customBundle;

  if (!hydrated) return null;

  return (
    <>
      <Toast msg={toast} />
      <main className="mx-auto max-w-6xl px-4 py-7">
        <AppHeader subtitle={t.tagline} />

        {clientView === "builder" && (
          <>
            {loadFailed && (
              <div className="mb-5 rounded-lg border border-warn bg-warn-soft px-4 py-3 text-sm text-warn">
                {t.catalogError}
              </div>
            )}

            <section className="mb-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">{t.businessType}</p>
              <BusinessPresets presets={bundles} activePreset={activePreset} onSelect={loadPreset} />
              <p className="mt-2 text-[0.78rem] text-faint">{t.businessTypeHelp}</p>
            </section>

            <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_320px]">
              <PublicProductCatalog
                products={products}
                currency={config.currency}
                selection={selection}
                onToggle={toggle}
              />
              <div className="lg:sticky lg:top-4">
                <PublicBundleBuilder
                  products={products}
                  selection={selection}
                  presets={bundles}
                  activePreset={activePreset}
                  currency={config.currency}
                  bundleDiscount={config.bundleDiscount}
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

function Toast({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <div className="toast-in fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-lg border border-accent bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      {msg}
    </div>
  );
}
