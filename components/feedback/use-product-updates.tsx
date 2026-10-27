"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useVisiblePolling } from "@/hooks/use-visible-polling";
import type { ProductUpdate, FeedbackNotification } from "@/lib/feedback/model";

type UpdatesContext = { updates: ProductUpdate[]; feedbackNotifications: FeedbackNotification[]; error: string; loading: boolean; refresh: () => Promise<void> };
const ProductUpdatesContext = createContext<UpdatesContext | null>(null);

export function ProductUpdatesProvider({ children }: { children: React.ReactNode }) {
  const [updates, setUpdates] = useState<ProductUpdate[]>([]);
  const [feedbackNotifications, setFeedbackNotifications] = useState<FeedbackNotification[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const response = await fetch("/api/product-updates", { cache: "no-store", signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Không tải được thông báo.");
      if (!signal.aborted) { setUpdates(payload.updates); setFeedbackNotifications(payload.feedbackNotifications ?? []); setError(""); }
    } catch { if (!signal.aborted) setError("Không tải được thông báo. Vui lòng thử lại."); }
    finally { if (!signal.aborted) setLoading(false); }
  }, []);
  const refresh = useVisiblePolling(load, "product-updates-changed");
  return <ProductUpdatesContext.Provider value={{ updates, feedbackNotifications, error, loading, refresh }}>{children}</ProductUpdatesContext.Provider>;
}

export function useProductUpdates() {
  const context = useContext(ProductUpdatesContext);
  if (!context) throw new Error("useProductUpdates requires ProductUpdatesProvider");
  return context;
}
