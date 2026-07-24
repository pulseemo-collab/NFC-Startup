// Tiny, safe localStorage helpers. SSR-safe (no-ops on the server).

export const KEYS = {
  costs: "nfc.costs.v1",
  prices: "nfc.prices.v1",
  settings: "nfc.settings.v1",
  selection: "nfc.selection.v1",
  orders: "nfc.orders.v1",
} as const;

export function loadJSON<T extends object>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    // Merge over the fallback so new defaults (e.g. new products/settings) survive.
    return { ...fallback, ...(JSON.parse(raw) as Partial<T>) };
  } catch {
    return fallback;
  }
}

export function saveJSON(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
