import { cn } from "@/utils/cn";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "ops-panel p-4 sm:p-5",
        className,
      )}
    >
      {children}
    </section>
  );
}
