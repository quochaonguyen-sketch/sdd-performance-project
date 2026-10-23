import Image from "next/image";
import { cn } from "@/utils/cn";

export const APP_NAME = "SDD Operations";
export const APP_UNIT = "SDD · Khu vực 1–5";

export function SddMark({ className }: { className?: string }) {
  return <svg className={cn("ops-brand-mark", className)} viewBox="0 0 96 96" fill="none" aria-hidden="true">
    <g transform="translate(6 0)">
      <path fill="currentColor" d="M30 12h54L69 30H39L27 44h35l16 16-28 32H0l16-18h26l12-14H20L6 44l24-32Z" />
      <path className="ops-brand-fold" d="m20 60 7-16h35l16 16H20Z" />
    </g>
  </svg>;
}

export function AppBrand({ compact = false, inverse = false, className }: { compact?: boolean; inverse?: boolean; className?: string }) {
  return <div className={cn("ops-brand", compact && "is-compact", inverse && "is-inverse", className)} role="img" aria-label={APP_NAME}>
    <Image className="ops-brand-logo is-light" src="/brand/sdd-ribbon.svg" width={270} height={105} alt="" aria-hidden="true" loading="eager" unoptimized />
    <Image className="ops-brand-logo is-dark" src="/brand/sdd-ribbon-inverse.svg" width={270} height={105} alt="" aria-hidden="true" loading="eager" unoptimized />
  </div>;
}
export function AppCopyright({ className }: { className?: string }) {
  return <p className={cn("ops-copyright", className)}>© {new Date().getFullYear()} SDD · Khu vực 1–5</p>;
}
