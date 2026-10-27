"use client";

import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

export function NavigationGroup({ label, icon: Icon, active, children, mobile = false }: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  children: React.ReactNode;
  mobile?: boolean;
}) {
  return <details className={cn("app-nav-group", active && "is-active", mobile && "is-mobile")} open={active || undefined}>
    <summary className="app-nav-group-heading"><Icon size={17} aria-hidden="true"/><span>{label}</span><ChevronDown size={14} className="app-nav-group-chevron" aria-hidden="true"/></summary>
    <div className="app-nav-group-items">{children}</div>
  </details>;
}
