export function restoreFilter<T>(raw: string | null, fallback: T): T {
  if (!raw || raw.length > 4000) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    const matches = (saved: unknown, initial: unknown): boolean => {
      if (typeof initial === "string") return typeof saved === "string" && saved.length <= 1000;
      if (typeof initial === "number") return typeof saved === "number" && Number.isFinite(saved);
      if (typeof initial === "boolean") return typeof saved === "boolean";
      if (initial && typeof initial === "object" && !Array.isArray(initial)) return !!saved && typeof saved === "object" && !Array.isArray(saved) && Object.entries(initial).every(([key, item]) => matches((saved as Record<string, unknown>)[key], item));
      return saved === initial;
    };
    return matches(value, fallback) ? value as T : fallback;
  } catch { return fallback; }
}
