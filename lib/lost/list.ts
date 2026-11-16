import { lostDisplayStatus, lostLogRole, lostNameKey, matchesLostGroup, type LostGroup, type LostRow } from "./model.ts";

const groupIds = ["all", "pickup", "not-received", "shortage", "other"] as const satisfies readonly LostGroup[];
const sortOrders = ["date-desc", "date-asc", "rider-asc", "rider-desc"] as const;
const vietnamese = new Intl.Collator("vi", { sensitivity: "accent" });
export const noLostClassification = "Không có phân loại LOST";
export const lostPageSize = 30;
export type LostSort = typeof sortOrders[number];
export type LostFilters = { group: LostGroup; incident: string | null; status: string; q: string; withLogs: boolean; page: number; sort: LostSort };
export const defaultLostFilters: LostFilters = { group: "all", incident: null, status: "all", q: "", withLogs: false, page: 0, sort: "date-desc" };

export function parseLostFilters(params: URLSearchParams): LostFilters {
  const requestedGroup = params.get("group");
  const requestedSort = params.get("sort");
  const page = Number(params.get("page") ?? 0);
  return {
    group: groupIds.find(group => group === requestedGroup) ?? "all",
    incident: params.get("incident"),
    status: params.get("status") ?? "all",
    q: (params.get("q") ?? "").slice(0, 120),
    withLogs: params.get("withLogs") === "1",
    page: Number.isSafeInteger(page) && page >= 0 ? page : 0,
    sort: sortOrders.find(sort => sort === requestedSort) ?? defaultLostFilters.sort,
  };
}

export function prepareLostSnapshot(rows: LostRow[], syncedAt: string | null, error: string | null) {
  const incidents = new Map<string, { key: string; label: string; count: number }>();
  const indexed = rows.map(row => {
    const key = row.incidentType ?? "";
    const incident = incidents.get(key) ?? { key, label: key || noLostClassification, count: 0 };
    incident.count += 1;
    incidents.set(key, incident);
    return {
      row, incidentKey: key,
      terms: [row.shipment, incident.label, row.event?.rider, row.event?.code, row.latestLog?.rider, ...row.logs.map(log => log.rider)]
        .filter((term): term is string => !!term).map(lostNameKey),
    };
  });
  const groups = groupIds.map(id => {
    const entries = indexed.filter(({ row }) => matchesLostGroup(row, id));
    return { id, entries, statuses: [...new Set(entries.map(({ row }) => lostDisplayStatus(row)))].sort() };
  });
  return {
    groups, syncedAt, error,
    incidents: [...incidents.values()].sort((a, b) => b.count - a.count || vietnamese.compare(a.label, b.label)),
    counts: Object.fromEntries(groups.map(group => [group.id, group.entries.length])) as Record<LostGroup, number>,
    rowsByNumber: new Map(rows.map(row => [row.row, row])),
  };
}

export function selectLostPage(snapshot: ReturnType<typeof prepareLostSnapshot>, filters: LostFilters) {
  const selected = snapshot.groups.find(group => group.id === filters.group) ?? snapshot.groups[0];
  const term = lostNameKey(filters.q);
  const matching = selected.entries.filter(({ row, terms, incidentKey }) =>
    (filters.incident === null || incidentKey === filters.incident) &&
    (filters.status === "all" || lostDisplayStatus(row) === filters.status) && (!filters.withLogs || row.latestLog || row.logs.length > 0) &&
    (!term || terms.some(value => value.includes(term))));
  const { sort } = filters;
  matching.sort(({ row: a }, { row: b }) => {
    if (sort === "rider-asc" || sort === "rider-desc") {
      const left = a.event?.rider?.trim();
      const right = b.event?.rider?.trim();
      if (left && right) {
        const order = vietnamese.compare(left, right);
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
    rows: matching.slice(page * lostPageSize, (page + 1) * lostPageSize).map(({ row: { logs, latestLog, ...row } }) => {
      const log = latestLog ?? logs[0];
      const error = log?.error ?? "";
      return {
        ...row, logRider: log ? log.rider || "Chưa rõ người ghi" : null, logAt: log?.at ?? null,
        logRole: log ? lostLogRole(log) : null, logSource: log?.app || null,
        logError: error.length > 120 ? `${error.slice(0, 120)}…` : error,
      };
    }),
    group: selected.id, incident: filters.incident, incidents: snapshot.incidents, statuses: selected.statuses,
    counts: snapshot.counts, total, page, last, sort,
    checked: matching.filter(({ row }) => (row.logSourcesChecked ?? row.logsChecked) && row.trackingChecked).length,
    logRows: matching.filter(({ row }) => row.latestLog || row.logs.length > 0).length,
    syncedAt: snapshot.syncedAt, error: snapshot.error,
  };
}

export type LostPageData = ReturnType<typeof selectLostPage>;
