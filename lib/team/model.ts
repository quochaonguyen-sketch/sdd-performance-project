export const STAFF_ROLES = ["SUP", "LEAD", "FTE", "BPO", "UNKNOWN"] as const;
export type StaffRole = typeof STAFF_ROLES[number];
export type Staff = {
  id: string; full_name: string; ops_id: string; staff_id: string; email: string;
  role: StaffRole; source_title: string; team: string; status: string; gender: string;
  onboard: string; vendor: string; coverage: string; areas: string[];
  archived: boolean; review_note: string; source_file: string; source_row: number | null;
};
export type StaffShift = { staff_id: string; work_date: string; shift: string; updated_at?: string };
export function isArchivedStaff(person: Pick<Staff, "archived" | "status">) {
  return person.archived || person.status.toLowerCase() === "inactive";
}
export function staffAreas(coverage: string) {
  if (/^all$/i.test(coverage.trim())) return ["KV1", "KV2", "KV3", "KV4", "KV5"];
  const areas = new Set<string>();
  if (/kv/i.test(coverage)) for (const n of coverage.match(/[1-6]/g) ?? []) areas.add(`KV${n}`);
  if (/\bSPF\b/i.test(coverage)) areas.add("SPF");
  return [...areas];
}
export function shiftKind(value: string) {
  const s = value.trim().toUpperCase();
  if (!s) return "empty";
  if (s === "OFF") return "off";
  if (/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(s)) return "work";
  if (/^\d{2}:\d{2}-\d{2}:\d{2}\//.test(s)) return "mixed";
  if (["AL", "SL", "PH", "NPL", "HL", "KL", "ML", "CL"].includes(s)) return "leave";
  return "other";
}
export function vietnamToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
export function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
