"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type SetStateAction } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { restoreFilter } from "@/lib/filters/remembered-state";

function createMemory(userId?: string) {
  const values = new Map<string, string>();
  const listeners = new Set<() => void>();
  let version = 0;
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    version: () => version,
    get(key: string) {
      if (values.has(key)) return values.get(key)!;
      try { return userId ? sessionStorage.getItem(`ops-filters:${userId}:${key}`) : null; } catch { return null; }
    },
    set(key: string, value: string) {
      if (this.get(key) === value) return;
      values.set(key, value);
      try { if (userId) sessionStorage.setItem(`ops-filters:${userId}:${key}`, value); } catch { /* In-memory retention still works if storage is unavailable. */ }
      version++; listeners.forEach(listener => listener());
    },
  };
}
const FilterMemory = createContext<ReturnType<typeof createMemory> | null>(null);
const serverVersion = () => 0;

export function FilterMemoryProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const [memory] = useState(() => createMemory(userId));
  const pathname = usePathname(), search = useSearchParams().toString();
  useEffect(() => {
    const params = new URLSearchParams(search); params.delete("embed"); params.delete("_r");
    memory.set(`url:${pathname}`, JSON.stringify(params.toString()));
  }, [memory, pathname, search]);
  return <FilterMemory.Provider value={memory}>{children}</FilterMemory.Provider>;
}

export function useRememberedState<T>(key: string, initial: T) {
  const [initialValue] = useState(() => initial);
  const context = useContext(FilterMemory);
  const [local] = useState(() => createMemory());
  const memory = context ?? local;
  const fallback = JSON.stringify(initialValue);
  const snapshot = useSyncExternalStore(memory.subscribe, () => memory.get(key) ?? fallback, () => fallback);
  const value = useMemo(() => restoreFilter(snapshot, initialValue), [snapshot, initialValue]);
  const set = useCallback((next: SetStateAction<T>) => {
    const previous = restoreFilter(memory.get(key), initialValue);
    memory.set(key, JSON.stringify(typeof next === "function" ? (next as (value: T) => T)(previous) : next));
  }, [memory, key, initialValue]);
  return [value, set] as const;
}

export function useRememberedLinks() {
  const memory = useContext(FilterMemory);
  useSyncExternalStore(memory?.subscribe ?? (() => () => {}), memory?.version ?? serverVersion, serverVersion);
  return (href: string) => {
    if (href.includes("?") || href.includes("#")) return href;
    const query = restoreFilter(memory?.get(`url:${href}`) ?? null, "");
    return query ? `${href}?${query}` : href;
  };
}
