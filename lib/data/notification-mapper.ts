// Pure DB-row → AppNotification mapping. Shared by the "use server" data layer
// (lib/data/notifications.ts) and the client Realtime handlers.

import type { AppNotification, NotificationType } from "@/lib/data/notification-types";

export type Row = Record<string, unknown>;

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

export function rowToNotification(r: Row): AppNotification {
  return {
    id: str(r.id),
    type: str(r.type) as NotificationType,
    title: str(r.title),
    body: str(r.body),
    read: r.read === true,
    dedupeKey: r.dedupe_key == null ? null : str(r.dedupe_key),
    meta: r.meta && typeof r.meta === "object" ? (r.meta as Record<string, unknown>) : {},
    createdAt: str(r.created_at),
  };
}
