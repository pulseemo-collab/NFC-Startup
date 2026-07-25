// Types for the product/pricing/settings data layer.
//
// STRICT public/private separation. The PUBLIC types below contain NO supplier
// cost, margin, profit, or private pricing rules and are the ONLY product types a
// public (client "/") component may import. The OWNER types carry private fields
// and must only ever be used inside the authenticated /dashboard tree.

// ------------------------------- PUBLIC -----------------------------------

/** A product as the anonymous customer sees it. No cost/margin/rules. */
export interface PublicProduct {
  slug: string;
  name: string;
  category: string;
  tag: "green" | "yellow";
  descriptionSq: string;
  /** Authoritative selling price, BASE currency (EUR). This is public. */
  sellPriceEur: number;
}

/** Customer-facing configuration. Never the margin/profit rules. */
export interface PublicConfig {
  currency: string; // display currency for the public site (ALL)
  bundleDiscount: number; // 0..1 — customer-facing "you save"
}

/** One receipt line — customer-safe (no unitCost). */
export interface ClientReceiptLine {
  productId: string;
  name: string;
  descriptionSq: string;
  qty: number;
  unitPrice: number; // BASE currency
}

/**
 * The customer-safe receipt shape rendered by ClientOrderView. OrderSnapshot
 * (owner) is structurally assignable to this, but this type exposes only
 * customer-safe fields — never totalCost / profit / margin / unitCost.
 */
export interface ClientReceipt {
  number: string;
  createdAt: string;
  currency: string;
  businessName: string;
  status: "new" | "ready" | "delivered";
  lines: ClientReceiptLine[];
  separatePrice: number;
  bundleDiscountPct: number;
  finalPrice: number;
  saved: number;
  customerNotes?: string;
}

/** Full public receipt returned by the server after a validated order. */
export interface PublicReceipt extends ClientReceipt {
  id: string;
  businessType: string;
  businessTypeLabel: string;
  customerName?: string;
  phone?: string;
  address?: string;
}

/** What the browser is allowed to send: selections + customer details ONLY. */
export interface PublicOrderItem {
  slug: string;
  qty: number;
}
export interface PublicOrderRequest {
  currency: string;
  businessType: string;
  businessTypeLabel: string;
  businessName: string;
  customerName?: string;
  phone?: string;
  address?: string;
  customerNotes?: string;
  items: PublicOrderItem[];
}

/** Read-only authoritative quote (public totals only). */
export interface PublicQuote {
  currency: string;
  separatePrice: number;
  finalPrice: number;
  saved: number;
  bundleDiscountPct: number;
  lines: ClientReceiptLine[];
}

export type PublicProductsResult = { ok: true; products: PublicProduct[] } | { ok: false; error: string };
export type PublicConfigResult = { ok: true; config: PublicConfig } | { ok: false; error: string };
export type PublicOrderResult = { ok: true; receipt: PublicReceipt } | { ok: false; error: string };
export type PublicQuoteResult = { ok: true; quote: PublicQuote } | { ok: false; error: string };

// -------------------------------- OWNER -----------------------------------
// PRIVATE — only import inside the authenticated /dashboard tree.

/** Owner-facing lifecycle. `active` == publicly visible (is_active true). */
export type ProductStatus = "active" | "draft" | "archived";

export interface OwnerProduct {
  slug: string;
  name: string;
  category: string;
  tag: "green" | "yellow";
  descriptionSq: string;
  sellPriceEur: number;
  supplierCostEur: number; // PRIVATE
  minMargin: number; // PRIVATE
  minProfit: number; // PRIVATE
  market: { min: number; recommended: number; premium: number; max: number }; // PRIVATE
  ladder: number[]; // PRIVATE
  note: string; // PRIVATE
  status: ProductStatus;
  isActive: boolean;
  sortOrder: number;
}

export interface OwnerProductPatch {
  name?: string;
  category?: string;
  tag?: "green" | "yellow";
  descriptionSq?: string;
  sellPriceEur?: number;
  supplierCostEur?: number;
  minMargin?: number;
  minProfit?: number;
  market?: { min: number; recommended: number; premium: number; max: number };
  ladder?: number[];
  note?: string;
  status?: ProductStatus;
  isActive?: boolean;
  sortOrder?: number;
}

export interface OwnerSettings {
  currency: string;
  minMargin: number;
  minProfit: number;
  bundleDiscount: number;
  businessName: string;
  logoUrl: string;
}

export type OwnerProductsResult = { ok: true; products: OwnerProduct[] } | { ok: false; error: string };
export type OwnerProductResult = { ok: true; product: OwnerProduct } | { ok: false; error: string };
export type OwnerSettingsResult = { ok: true; settings: OwnerSettings } | { ok: false; error: string };
export type OwnerCatalogMutation = { ok: true } | { ok: false; error: string };
