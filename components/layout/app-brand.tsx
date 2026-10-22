import { cn } from "@/utils/cn";
export const APP_NAME = "Rider Operations";
export const APP_UNIT = "SDD · Khu vực 1–5";
export function TransitMark({ className }: { className?: string }) {
  return <svg className={cn("ops-brand-mark", className)} viewBox="0 0 40 40" fill="none" aria-hidden="true">
    <path d="M8 8v16a8 8 0 0 0 8 8h16M32 8H16a8 8 0 0 0 0 16h16" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="8" cy="8" r="3" fill="currentColor" /><circle cx="32" cy="24" r="3" fill="currentColor" />
  </svg>;
}
export function AppBrand({ compact = false, inverse = false, wordmarkOnly = false, className }: { compact?: boolean; inverse?: boolean; wordmarkOnly?: boolean; className?: string }) {
  return <div className={cn("ops-brand", compact && "is-compact", inverse && "is-inverse", className)}>
    {!wordmarkOnly ? <TransitMark /> : null}
    <div><p className="ops-brand-name" aria-label={APP_NAME}>rider<span>.</span></p><p className="ops-brand-unit">Operations / SDD</p></div>
  </div>;
}
export function AppCopyright({ className }: { className?: string }) {
  return <p className={cn("ops-copyright", className)}>© {new Date().getFullYear()} SDD · Khu vực 1–5</p>;
}
