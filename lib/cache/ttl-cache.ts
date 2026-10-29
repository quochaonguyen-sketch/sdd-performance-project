type Entry<T> = { value: T; expiresAt: number };

/** Bounded LRU cache. A pending read cannot repopulate an invalidated key. */
export class TtlCache<T> {
  private entries = new Map<string, Entry<T>>();
  private pending = new Map<string, Promise<Entry<T>>>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(ttlMs: number, maxEntries: number) {
    if (ttlMs <= 0 || !Number.isInteger(maxEntries) || maxEntries < 1) throw new Error("Invalid cache limits");
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  async load(key: string, loader: () => Promise<T>, shouldCache: (value: T) => boolean = () => true) {
    const now = Date.now();
    for (const [entryKey, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(entryKey);
    }
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return { ...cached, hit: true };
    }
    const existing = this.pending.get(key);
    if (existing) return { ...await existing, hit: false };

    const request = Promise.resolve().then(loader).then(value => {
      const entry = { value, expiresAt: Date.now() + this.ttlMs };
      if (this.pending.get(key) === request && shouldCache(value)) {
        this.entries.set(key, entry);
        while (this.entries.size > this.maxEntries) {
          this.entries.delete(this.entries.keys().next().value!);
        }
      }
      return entry;
    }).finally(() => {
      if (this.pending.get(key) === request) this.pending.delete(key);
    });
    this.pending.set(key, request);
    return { ...await request, hit: false };
  }

  delete(key: string) {
    this.entries.delete(key);
    this.pending.delete(key);
  }

  clear() {
    this.entries.clear();
    this.pending.clear();
  }
}
