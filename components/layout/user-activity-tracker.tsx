"use client";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function UserActivityTracker() {
  const pathname = usePathname();
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    void fetch("/api/activity", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: crypto.randomUUID(), path: pathname }), keepalive: true });
  }, [pathname]);
  return null;
}
