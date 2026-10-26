"use client";

import { useEffect, useId, useRef, useSyncExternalStore } from "react";

const activeLoadingKeys = new Set<string>();
const removalTimers = new Map<string, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function setAppLoading(key: string, active: boolean, releaseDelayMs = 0) {
  const existingTimer = removalTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer);
    removalTimers.delete(key);
  }

  if (active) {
    const changed = !activeLoadingKeys.has(key);
    activeLoadingKeys.add(key);
    if (changed) emitChange();
    return;
  }

  const release = () => {
    removalTimers.delete(key);
    const changed = activeLoadingKeys.delete(key);
    if (changed) emitChange();
  };

  if (releaseDelayMs > 0 && activeLoadingKeys.has(key)) {
    removalTimers.set(key, setTimeout(release, releaseDelayMs));
  } else {
    release();
  }
}

function releaseRouteLoading() {
  for (const key of activeLoadingKeys) {
    if (key.startsWith("route:")) setAppLoading(key, false);
  }
}

export function useAppLoading() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => activeLoadingKeys.size > 0,
    () => false,
  );
}

/**
 * Reports initial requests to the non-blocking global progress bar.
 * Later manual/realtime refreshes keep using the page's local loading state.
 */
export function useReportInitialDataLoading(scope: string, loading: boolean) {
  const instanceId = useId();
  const key = `data:${scope}:${instanceId}`;
  const completed = useRef(false);

  useEffect(() => {
    if (!loading) completed.current = true;
    const shouldReport = loading && !completed.current;

    // Register the page request first, then release the route handoff. This
    // keeps progress continuous during the route handoff.
    setAppLoading(key, shouldReport);
    releaseRouteLoading();

    return () => setAppLoading(key, false);
  }, [key, loading]);
}
