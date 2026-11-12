import { lostNameKey, matchesLostGroup, type LostGroup, type LostRow } from "./model.ts";

const groupIds = ["all", "pickup", "not-received", "shortage", "other"] as const satisfies readonly LostGroup[];
const sortOrders = ["date-desc", "date-asc", "rider-asc", "rider-desc"] as const;
const riderNames = new Intl.Collator("vi", { sensitivity: "accent" });
export const lostPageSize = 30;
export type LostSort = typeof sortOrders[number];
export type LostFilters = { group: LostGroup; status: string; q: string; withLogs: boolean; page: number; sort: LostSort };
export const defaultLostFilters: LostFilters = { group: "all", status: "all", q: "", withLogs: false, page: 0, sort: "date-desc" };

export function parseLostFilters(params: URLSearchParams): LostFilters {
  const requestedGroup = params.get("group");
  const requestedSort = params.get("sort");
  const page = Number(params.get("page") ?? 0);
  return {
    group: groupIds.find(group => group === requestedGroup) ?? "all",
    status: params.get("status") ?? "all",
    q: (params.get("q") ?? "").slice(0, 120),
    withLogs: params.get("withLogs") === "1",
    page: Number.isSafeInteger(page) && page >= 0 ? page : 0,
    sort: sortOrders.find(sort => sort === requestedSort) ?? defaultLostFilters.sort,
  };
}

export function prepareLostSnapshot(rows: LostRow[], syncedAt: string | null, error: string | null) {
  const indexed = rows.map(row => ({
    row,
    terms: [row.shipment, row.reason, row.event?.rider, row.event?.code, ...row.logs.map(log => log.rider)]
      .filter((term): term is string => !!term).map(lostNameKey),
  }));
  const groups = groupIds.map(id => {
    const entries = indexed.filter(({ row }) => matchesLostGroup(row, id));
    return { id, entries, statuses: [...new Set(entries.map(({ row }) => row.status))].sort() };
  });
  return {
    groups, syncedAt, error,
    counts: Object.fromEntries(groups.map(group => [group.id, group.entries.length])) as Record<LostGroup, number>,
    rowsByNumber: new Map(rows.map(row => [row.row, row])),
  };
}

export function selectLostPage(snapshot: ReturnType<typeof prepareLostSnapshot>, filters: LostFilters) {
  const selected = snapshot.groups.find(group => group.id === filters.group) ?? snapshot.groups[0];
  const term = lostNameKey(filters.q);
  const matching = selected.entries.filter(({ row, terms }) =>
    (filters.status === "all" || row.status === filters.status) && (!filters.withLogs || row.logs.length > 0) &&
    (!term || terms.some(value => value.includes(term))));
  const { sort } = filters;
  matching.sort(({ row: a }, { row: b }) => {
    if (sort === "rider-asc" || sort === "rider-desc") {
      const left = a.event?.rider?.trim();
      const right = b.event?.rider?.trim();
      if (left && right) {
        const order = riderNames.compare(left, right);
        if (order) return sort === "rider-asc" ? order : -order;
      } else if (left || right) {
        return left ? -1 : 1;
      }
    }
    return sort === "date-asc" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
  });
  const total = matching.length;
  const last = Math.max(0, Math.ceil(total / lostPageSize) - 1);
  const page = Math.min(filters.page, last);
  return {
    rows: matching.slice(page * lostPageSize, (page + 1) * lostPageSize).map(({ row: { logs, ...row } }) => ({
      ...row, logRider: logs[0]?.rider ?? null,
    })),
    group: selected.id, statuses: selected.statuses, counts: snapshot.counts, total, page, last, sort,
    checked: matching.filter(({ row }) => row.logsChecked && row.trackingChecked).length,
    logRows: matching.filter(({ row }) => row.logs.length > 0).length,
    syncedAt: snapshot.syncedAt, error: snapshot.error,
  };
}

export type LostPageData = ReturnType<typeof selectLostPage>;
