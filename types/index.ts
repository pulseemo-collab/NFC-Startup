// Shared domain types for the NFC reseller app.

export type ColorTag = "green" | "yellow";

export interface MarketPrices {
  /** Lowest price the market realistically bears. */
  min: number;
  /** The default "best" price for a normal cost. */
  recommended: number;
  /** A stronger, still-acceptable price for higher costs. */
  premium: number;
  /** Top of the realistic market range — never exceed without a warning. */
  max: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  tag: ColorTag;
  /** Seed purchase cost; the user overrides this and we persist it. */
  defaultCost: number;
  market: MarketPrices;
  /** Psychological price points (9, 19, 29 …) within the realistic range. */
  ladder: number[];
  /** Product-level margin floor (0..1). */
  minMargin: number;
  /** Product-level absolute profit floor. */
  minProfit: number;
  /** Short, static context for why this product is priced where it is (INTERNAL/owner-only). */
  note: string;
  /** Customer-facing Albanian description (safe to show clients). */
  descriptionSq: string;
}

export interface BundleDef {
  id: string;
  name: string;
  stars: number;
  /** productId -> quantity */
  kit: Record<string, number>;
}

export interface Settings {
  currency: string; // display currency: "ALL" | "EUR" | "USD" (see lib/currency.ts)
  minMargin: number; // global default margin floor (0..1)
  minProfit: number; // global default profit floor
  bundleDiscount: number; // 0..1
  businessName?: string; // branding — shown in the dashboard header & receipts
  logoUrl?: string; // branding — optional logo image URL
}

export type PriceStatus = "recommended" | "raised" | "not-viable";

export interface PriceResult {
  price: number;
  profit: number;
  margin: number; // 0..1
  status: PriceStatus;
  reason: string;
}

export interface BundleLine {
  product: Product;
  qty: number;
  unitPrice: number;
  cost: number;
}

export interface BundleResult {
  lines: BundleLine[];
  units: number;
  /** Sum of recommended unit prices × qty, before any bundle discount. */
  separatePrice: number;
  totalCost: number;
  /** Final bundle price after a margin-safe discount. */
  price: number;
  profit: number;
  margin: number; // 0..1
  saved: number;
  discountPct: number; // effective discount actually applied
  /** True when the requested discount was reduced to protect the margin floor. */
  capped: boolean;
}

// ---------------------------------------------------------------------------
// Modes & Orders
// ---------------------------------------------------------------------------

/** "select" is retired — the mode is now decided by the route (/ vs /dashboard). */
export type AppMode = "select" | "owner" | "client";

/** The whole fulfilment workflow: received → packed → shipped. */
export type OrderStatus = "new" | "ready" | "delivered";
export type PaymentStatus = "unpaid" | "deposit" | "paid";

/** A frozen copy of one line as it was when the order was finalized. */
export interface OrderLineSnapshot {
  productId: string;
  name: string; // English product name at time of order
  descriptionSq: string;
  qty: number;
  unitPrice: number; // selling price snapshot
  unitCost: number; // purchase cost snapshot (INTERNAL)
}

/** A permanent, self-contained snapshot of a finalized order. */
export interface OrderSnapshot {
  id: string;
  number: string; // e.g. NFC-0001
  createdAt: string; // ISO
  updatedAt: string; // ISO
  currency: string;

  // business / customer
  businessType: string; // preset id
  businessTypeLabel: string;
  businessName: string;
  customerName?: string;
  phone?: string;
  address?: string;
  customerNotes?: string; // customer-facing (safe for client view)
  ownerNotes?: string; // PRIVATE

  // status
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  amountPaid: number;

  // frozen financials
  lines: OrderLineSnapshot[];
  separatePrice: number;
  bundleDiscountPct: number; // effective
  finalPrice: number;
  totalCost: number; // INTERNAL
  profit: number; // INTERNAL
  margin: number; // 0..1, INTERNAL
  saved: number;
}

export interface OrderStore {
  version: number;
  counter: number; // last order number used
  orders: OrderSnapshot[];
}

/** Shape of the JSON backup produced by Export / consumed by Import. */
export interface BackupFile {
  app: "nfc-reseller";
  version: number;
  exportedAt: string;
  settings: Settings;
  costs: Record<string, number>;
  /** Owner price overrides ("Çmimi im"). Absent in backups made before v1.1. */
  prices?: Record<string, number>;
  selection: Record<string, number>;
  orders: OrderStore;
}
