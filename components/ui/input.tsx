import type { ComponentProps } from "react";
import { cn } from "@/utils/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "ops-input h-10 w-full px-3 text-sm outline-none disabled:cursor-not-allowed",
        className,
      )}
      {...props}
    />
  );
}
