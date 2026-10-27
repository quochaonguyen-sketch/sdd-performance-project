"use client";

import { useCallback, useEffect, useRef } from "react";
import { startVisiblePolling } from "@/lib/polling/visible-poller";

export function useVisiblePolling(load: (signal: AbortSignal) => Promise<void>, eventName?: string, intervalMs = 60_000) {
  const poller = useRef<ReturnType<typeof startVisiblePolling> | null>(null);
  useEffect(() => {
    const current = startVisiblePolling(load, intervalMs, eventName);
    poller.current = current;
    return () => { current.stop(); if (poller.current === current) poller.current = null; };
  }, [load, intervalMs, eventName]);
  return useCallback(() => poller.current?.refresh() ?? Promise.resolve(), []);
}
