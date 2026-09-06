"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { BarChart3, PackageSearch } from "lucide-react";
import { cn } from "@/utils/cn";
import { returnViewFrom, type ReturnView } from "@/lib/return-orders/return-orders";

// LITE: chỉ giữ Tổng quan, bỏ Tra cứu / Rider trả / Phân công COT.
const VIEWS: Array<{ id: ReturnView; href: string; label: string; icon: typeof PackageSearch }> = [
  { id: "dashboard", href: "/return-orders?view=dashboard", label: "Tổng quan", icon: BarChart3 },
];

export function ReturnOrdersSwitcher() {
  const searchParams = useSearchParams();
  const active = returnViewFrom(searchParams.get("view"));

  return (
    <nav className="return-orders-tabs" aria-label="Phân trang hàng trả">
      {VIEWS.map((viewItem) => {
        const Icon = viewItem.icon;
        return (
          <Link
            key={viewItem.id}
            href={viewItem.href}
            scroll={false}
            aria-current={active === viewItem.id ? "page" : undefined}
            className={cn("return-orders-tab", active === viewItem.id && "is-active")}
          >
            <Icon size={16} aria-hidden="true" />
            <span>{viewItem.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
