import type {
  BackupFile,
  BundleResult,
  OrderSnapshot,
  OrderStore,
  Product,
  Settings,
} from "@/types";
import { KEYS, saveJSON } from "@/lib/storage";
import { priceBundle, type PriceOverrides } from "@/lib/pricing";

const CURRENT_VERSION = 1;

export function emptyStore(): OrderStore {
  return { version: CURRENT_VERSION, counter: 0, orders: [] };
}

/** Defensive load: malformed data never crashes the app. */
export function loadOrders(): OrderStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(KEYS.orders);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const obj = parsed as Partial<OrderStore>;
    const orders = Array.isArray(obj.orders)
      ? obj.orders.filter((o): o is OrderSnapshot => !!o && typeof (o as OrderSnapshot).number === "string")
      : [];
    const counter = typeof obj.counter === "number" ? obj.counter : orders.length;
    return { version: CURRENT_VERSION, counter, orders };
  } catch {
    return emptyStore();
  }
}

export function saveOrders(store: OrderStore): void {
  saveJSON(KEYS.orders, store);
}

export function formatOrderNumber(counter: number): string {
  return `NFC-${String(counter).padStart(4, "0")}`;
}

function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Checkout collects only contact + delivery info. Payment is handled later by
// the owner in Owner Mode, so it is no longer part of the customer form.
export interface OrderFormInput {
  businessName: string;
  customerName?: string;
  phone?: string;
  address?: string;
  customerNotes?: string;
}

/** Compute the exact financials + frozen line snapshots from the live builder. */
export function snapshotFinancials(
  selection: Record<string, number>,
  products: Product[],
  costs: Record<string, number>,
  settings: Settings,
  overrides?: PriceOverrides
): { result: BundleResult; lines: OrderSnapshot["lines"] } {
  const result = priceBundle(selection, products, costs, settings, overrides);
  const lines: OrderSnapshot["lines"] = result.lines.map((l) => ({
    productId: l.product.id,
    name: l.product.name,
    descriptionSq: l.product.descriptionSq,
    qty: l.qty,
    unitPrice: l.unitPrice,
    unitCost: l.cost,
  }));
  return { result, lines };
}

/** Build a brand-new finalized order snapshot. */
export function buildOrder(
  form: OrderFormInput,
  businessType: string,
  businessTypeLabel: string,
  selection: Record<string, number>,
  products: Product[],
  costs: Record<string, number>,
  settings: Settings,
  counter: number,
  overrides?: PriceOverrides
): OrderSnapshot {
  const { result, lines } = snapshotFinancials(selection, products, costs, settings, overrides);
  const now = new Date().toISOString();
  return {
    id: uid(),
    number: formatOrderNumber(counter),
    createdAt: now,
    updatedAt: now,
    currency: settings.currency,
    businessType,
    businessTypeLabel,
    businessName: form.businessName.trim() || businessTypeLabel,
    customerName: form.customerName?.trim() || undefined,
    phone: form.phone?.trim() || undefined,
    address: form.address?.trim() || undefined,
    customerNotes: form.customerNotes?.trim() || undefined,
    ownerNotes: undefined,
    status: "new",
    // Defaults — the owner sets these later in Owner Mode.
    paymentStatus: "unpaid",
    amountPaid: 0,
    lines,
    separatePrice: result.separatePrice,
    bundleDiscountPct: result.discountPct,
    finalPrice: result.price,
    totalCost: result.totalCost,
    profit: result.profit,
    margin: result.margin,
    saved: result.saved,
  };
}

/** Re-freeze financials onto an existing order (used by "Ruaj ndryshimet"). */
export function refreezeOrder(
  order: OrderSnapshot,
  selection: Record<string, number>,
  products: Product[],
  costs: Record<string, number>,
  settings: Settings,
  overrides?: PriceOverrides
): OrderSnapshot {
  const { result, lines } = snapshotFinancials(selection, products, costs, settings, overrides);
  return {
    ...order,
    updatedAt: new Date().toISOString(),
    currency: settings.currency,
    lines,
    separatePrice: result.separatePrice,
    bundleDiscountPct: result.discountPct,
    finalPrice: result.price,
    totalCost: result.totalCost,
    profit: result.profit,
    margin: result.margin,
    saved: result.saved,
  };
}

export function duplicateOrder(order: OrderSnapshot, counter: number): OrderSnapshot {
  const now = new Date().toISOString();
  return {
    ...order,
    id: uid(),
    number: formatOrderNumber(counter),
    createdAt: now,
    updatedAt: now,
    status: "new",
  };
}

/** Rebuild a { productId: qty } selection from a saved order (for editing). */
export function selectionFromOrder(order: OrderSnapshot): Record<string, number> {
  const sel: Record<string, number> = {};
  for (const l of order.lines) sel[l.productId] = l.qty;
  return sel;
}

// -------------------------- Export / Import --------------------------

export function buildBackup(
  settings: Settings,
  costs: Record<string, number>,
  prices: PriceOverrides,
  selection: Record<string, number>,
  orders: OrderStore
): BackupFile {
  return {
    app: "nfc-reseller",
    version: CURRENT_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    costs,
    prices,
    selection,
    orders,
  };
}

export function isValidBackup(obj: unknown): obj is BackupFile {
  if (!obj || typeof obj !== "object") return false;
  const b = obj as Partial<BackupFile>;
  if (b.app !== "nfc-reseller") return false;
  if (!b.settings || typeof b.settings !== "object") return false;
  if (!b.costs || typeof b.costs !== "object") return false;
  if (!b.orders || typeof b.orders !== "object" || !Array.isArray(b.orders.orders)) return false;
  return true;
}
