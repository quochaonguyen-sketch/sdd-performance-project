import type { SelectHTMLAttributes } from "react";
import { cn } from "@/utils/cn";

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "ops-input ops-select h-10 w-full px-3 text-sm outline-none disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}
