export type ReturnView = "ledger" | "rider" | "pivot" | "dashboard";

export function returnViewFrom(value: string | null | undefined): ReturnView {
  return value === "rider" || value === "pivot" || value === "dashboard" ? value : "ledger";
}
