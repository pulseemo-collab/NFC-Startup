// Real currency conversion + formatting.
//
// EVERY amount stored anywhere in the app (product market bands, ladders,
// costs, settings.minProfit, order snapshots, amountPaid) is kept in the BASE
// currency. Conversion happens ONLY at the display / input boundary, so the
// pricing engine and all stored data stay currency-independent.

export type CurrencyCode = "ALL" | "EUR" | "USD";

/** All internal numbers are EUR. Never change this without migrating storage. */
export const BASE_CURRENCY: CurrencyCode = "EUR";

/** Currency shown to customers and used by default everywhere. */
export const DEFAULT_CURRENCY: CurrencyCode = "ALL";

/** Order shown in the owner's currency selector. */
export const CURRENCIES: CurrencyCode[] = ["ALL", "EUR", "USD"];

/** Units of the target currency per 1 EUR. */
export const RATES: Record<CurrencyCode, number> = {
  EUR: 1,
  ALL: 100,
  USD: 1.08,
};

export const CURRENCY_LABEL: Record<CurrencyCode, string> = {
  ALL: "ALL — Lek",
  EUR: "EUR — €",
  USD: "USD — $",
};

/** Short marker used next to number inputs. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  ALL: "ALL",
  EUR: "€",
  USD: "$",
};

export function isCurrency(code: string): code is CurrencyCode {
  return code === "ALL" || code === "EUR" || code === "USD";
}

function rateFor(currency: string): number {
  return isCurrency(currency) ? RATES[currency] : 1;
}

export function symbolFor(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

/** How many decimals this currency is edited/displayed with. */
export function decimalsFor(currency: string): number {
  return currency === "ALL" ? 0 : 2;
}

/** Sensible step for a number input in this currency. */
export function stepFor(currency: string): number {
  return currency === "ALL" ? 10 : 0.05;
}

/** BASE amount -> amount in the displayed currency. */
export function toDisplay(baseValue: number, currency: string): number {
  if (!Number.isFinite(baseValue)) return 0;
  const raw = baseValue * rateFor(currency);
  const f = 10 ** decimalsFor(currency);
  return Math.round(raw * f) / f;
}

/** Amount typed in the displayed currency -> BASE amount. */
export function toBase(displayValue: number, currency: string): number {
  if (!Number.isFinite(displayValue)) return 0;
  return displayValue / rateFor(currency);
}

/**
 * Converts a BASE amount into the target currency and formats it.
 *   formatAmount(39, "ALL") -> "3,900 ALL"
 *   formatAmount(39, "EUR") -> "39 €"
 *   formatAmount(39, "USD") -> "$42.12"
 */
export function formatAmount(baseValue: number, currency: string): string {
  const v = toDisplay(baseValue, currency);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";

  if (currency === "ALL") {
    return `${sign}${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })} ALL`;
  }

  const isInt = Number.isInteger(v);
  const body = abs.toLocaleString("en-US", {
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: 2,
  });

  // EUR is written after the number in Albania; USD before it.
  if (currency === "EUR") return `${sign}${body} €`;
  if (currency === "USD") return `${sign}$${body}`;
  return `${sign}${symbolFor(currency)}${body}`;
}
