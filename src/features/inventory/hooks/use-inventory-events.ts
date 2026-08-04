"use client";

import { useEffect, useRef } from "react";

import type { InventoryEvent } from "@/lib/contracts";

import { inventoryEventsUrl } from "../api-client";

export type RealtimeStatus = "connecting" | "connected" | "reconnecting" | "offline";

type UseInventoryEventsOptions = {
  enabled: boolean;
  lastEventSeq: string;
  onEvent: (event: InventoryEvent) => void;
  onReconnect: () => void;
  onStatusChange: (status: RealtimeStatus) => void;
};

export function useInventoryEvents({
  enabled,
  lastEventSeq,
  onEvent,
  onReconnect,
  onStatusChange,
}: UseInventoryEventsOptions) {
  const seqRef = useRef(lastEventSeq);
  const onEventRef = useRef(onEvent);
  const onReconnectRef = useRef(onReconnect);
  const onStatusChangeRef = useRef(onStatusChange);

  useEffect(() => {
    seqRef.current = lastEventSeq;
    onEventRef.current = onEvent;
    onReconnectRef.current = onReconnect;
    onStatusChangeRef.current = onStatusChange;
  });

  useEffect(() => {
    if (!enabled) return;

    let openedOnce = false;
    const source = new EventSource(inventoryEventsUrl(seqRef.current));

    const updateNetworkStatus = () => {
      onStatusChangeRef.current(navigator.onLine ? "reconnecting" : "offline");
    };

    onStatusChangeRef.current("connecting");
    source.onopen = () => {
      onStatusChangeRef.current("connected");
      if (openedOnce) onReconnectRef.current();
      openedOnce = true;
    };
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as InventoryEvent;
        seqRef.current = event.seq;
        onEventRef.current(event);
      } catch {
        onReconnectRef.current();
      }
    };
    source.onerror = updateNetworkStatus;
    window.addEventListener("online", updateNetworkStatus);
    window.addEventListener("offline", updateNetworkStatus);

    return () => {
      source.close();
      window.removeEventListener("online", updateNetworkStatus);
      window.removeEventListener("offline", updateNetworkStatus);
    };
  }, [enabled]);
}
