"use client";

import { useAppLoading } from "@/components/layout/app-loading-store";

export function AppLoadingOverlay() {
  const loading = useAppLoading();

  return (
    <div
      className={`app-navigation-pending${loading ? " is-pending" : ""}`}
      aria-hidden={!loading}
      role={loading ? "status" : undefined}
      aria-live="polite"
      aria-label={loading ? "Đang tải dữ liệu vận hành" : undefined}
    >
      <span className="app-navigation-progress" aria-hidden="true" />
    </div>
  );
}
