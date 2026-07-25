// Order export (Part 6). Dependency-free CSV — opens natively in Excel/Sheets.
// Values are exported in BASE currency (EUR), numeric and unformatted, so the
// sheet is analysis-ready (sortable, summable) rather than display-formatted.
//
// A UTF-8 BOM is prepended so Excel on Windows renders Albanian characters
// (ë, ç, …) correctly. PDF/XLSX are intentionally NOT here: they require heavy
// libraries and a new supply-chain surface; add them only as an explicit opt-in.

import type { OrderSnapshot } from "@/types";
import { ORDER_STATUS_LABEL } from "@/lib/i18n";

const PAYMENT_LABEL: Record<string, string> = {
  unpaid: "Papaguar",
  deposit: "Kaparuar",
  paid: "Paguar",
};

/** RFC-4180 field escaping: quote when the value contains , " or newline. */
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

const HEADERS = [
  "Numri",
  "Data",
  "Lloji i biznesit",
  "Biznesi",
  "Klienti",
  "Telefoni",
  "Adresa",
  "Statusi",
  "Pagesa",
  "Njesi",
  "Cmimi ndaras (EUR)",
  "Zbritje (%)",
  "Cmimi final (EUR)",
  "Kosto (EUR)",
  "Fitim (EUR)",
  "Marzh (%)",
  "Kursim (EUR)",
];

function orderToRow(o: OrderSnapshot): (string | number)[] {
  const units = o.lines.reduce((s, l) => s + l.qty, 0);
  return [
    o.number,
    new Date(o.createdAt).toISOString().slice(0, 10),
    o.businessTypeLabel || o.businessType || "",
    o.businessName,
    o.customerName ?? "",
    o.phone ?? "",
    o.address ?? "",
    ORDER_STATUS_LABEL[o.status] ?? o.status,
    PAYMENT_LABEL[o.paymentStatus] ?? o.paymentStatus,
    units,
    money(o.separatePrice),
    Math.round(o.bundleDiscountPct * 100),
    money(o.finalPrice),
    money(o.totalCost),
    money(o.profit),
    Math.round(o.margin * 100),
    money(o.saved),
  ];
}

/** Build a CSV string (with BOM) from a list of orders. */
export function ordersToCsv(orders: OrderSnapshot[]): string {
  const lines = [HEADERS, ...orders.map(orderToRow)].map((row) => row.map(csvField).join(","));
  return "﻿" + lines.join("\r\n");
}

/** Trigger a client-side download of the given text as a file. */
export function downloadTextFile(filename: string, text: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Convenience: export orders straight to a dated CSV download. */
export function exportOrdersCsv(orders: OrderSnapshot[], scopeLabel = "orders"): void {
  const csv = ordersToCsv(orders);
  const date = new Date().toISOString().slice(0, 10);
  downloadTextFile(`nfc-${scopeLabel}-${date}.csv`, csv);
}
