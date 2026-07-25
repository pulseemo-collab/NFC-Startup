"use client";

// Authenticated Supabase Realtime for the owner dashboard.
//
// Subscribes — as the SIGNED-IN OWNER (cookie session → JWT) — to changes on the
// `orders` and `notifications` tables. Realtime enforces the same RLS as the REST
// path, so an anonymous session receives nothing. No service-role key is used.
//
// Design notes:
//  * ONE channel, two table listeners → no duplicate channels across re-renders.
//  * Handlers are read through a ref, so the effect subscribes exactly once
//    (deps: [enabled]) yet always calls the latest closures (current React state).
//  * Realtime is an ENHANCEMENT, not the source of truth: on a reconnect after a
//    transient error we call onReconnect() so the caller can re-fetch the
//    authoritative state and never miss events. No aggressive polling.

import { useEffect, useRef } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { type Row, rowToSnapshot } from "@/lib/data/order-mapper";
import { rowToNotification } from "@/lib/data/notification-mapper";
import type { OrderSnapshot } from "@/types";
import type { AppNotification } from "@/lib/data/notification-types";

export interface OwnerRealtimeHandlers {
  onOrderInsert: (o: OrderSnapshot) => void;
  onOrderUpdate: (o: OrderSnapshot) => void;
  onOrderDelete: (id: string) => void;
  onNotificationInsert: (n: AppNotification) => void;
  onNotificationUpdate: (n: AppNotification) => void;
  onNotificationDelete: (id: string) => void;
  /** Called after a reconnect so the caller can refetch authoritative state. */
  onReconnect: () => void;
}

type Change = RealtimePostgresChangesPayload<Row>;

function idOf(row: unknown): string {
  const v = (row as { id?: unknown } | null)?.id;
  return v == null ? "" : String(v);
}

export function useOwnerRealtime(enabled: boolean, handlers: OwnerRealtimeHandlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let hadError = false;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase.channel("owner-dashboard");

    const onOrders = (payload: Change) => {
      const h = ref.current;
      if (payload.eventType === "INSERT") h.onOrderInsert(rowToSnapshot(payload.new));
      else if (payload.eventType === "UPDATE") h.onOrderUpdate(rowToSnapshot(payload.new));
      else if (payload.eventType === "DELETE") h.onOrderDelete(idOf(payload.old));
    };
    const onNotifs = (payload: Change) => {
      const h = ref.current;
      if (payload.eventType === "INSERT") h.onNotificationInsert(rowToNotification(payload.new));
      else if (payload.eventType === "UPDATE") h.onNotificationUpdate(rowToNotification(payload.new));
      else if (payload.eventType === "DELETE") h.onNotificationDelete(idOf(payload.old));
    };

    (async () => {
      // Make Realtime use the authenticated access token so RLS is enforced.
      try {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session?.access_token) supabase.realtime.setAuth(data.session.access_token);
      } catch {
        /* fall through — subscribe will surface a CHANNEL_ERROR and we refetch */
      }
      if (cancelled) return;

      channel
        .on<Row>("postgres_changes", { event: "*", schema: "public", table: "orders" }, onOrders)
        .on<Row>("postgres_changes", { event: "*", schema: "public", table: "notifications" }, onNotifs)
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (hadError) {
              hadError = false;
              ref.current.onReconnect();
            }
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            hadError = true;
          }
        });
    })();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [enabled]);
}
