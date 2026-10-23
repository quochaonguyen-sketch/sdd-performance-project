import { Package, Route, Truck } from "lucide-react";
import { cn } from "@/utils/cn";

export function RiderLoaderVisual({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cn("rider-loader-surface", compact && "is-compact")}>
      <span className="rider-loader-flow" aria-hidden="true">
        <span className="rider-loader-station"><Package size={20} strokeWidth={1.6} /></span>
        <span className="rider-loader-connector" />
        <span className="rider-loader-station is-dispatch"><Route size={24} strokeWidth={1.6} /></span>
        <span className="rider-loader-connector is-outbound" />
        <span className="rider-loader-station"><Truck size={20} strokeWidth={1.6} /></span>
      </span>
      <span className="rider-loader-title">Đang tải dữ liệu vận hành</span>
      <span className="rider-loader-caption">Vui lòng chờ trong giây lát</span>
    </span>
  );
}

export function RiderPageLoader() {
  return (
    <div className="rider-page-loader" role="status" aria-live="polite" aria-label="Đang tải dữ liệu vận hành">
      <RiderLoaderVisual />
    </div>
  );
}
