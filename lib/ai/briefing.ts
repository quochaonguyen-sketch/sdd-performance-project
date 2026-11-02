import { OPERATING_AREAS } from "../locations/operating-areas.ts";
import { addDays, shiftKind, type Staff, type StaffShift } from "../team/model.ts";
import type { PickupRider } from "../pickup/realtime.ts";
import { pendingPickup } from "../pickup/workload.ts";
import { assistantHref } from "../filters/assistant-scope.ts";

export type SourceState = "ready" | "stale" | "missing" | "forbidden" | "error";
export type BriefingSource = { id: string; label: string; state: SourceState; at: string | null; href: string; note: string };
export type BriefingProfile = { rider_code: string; full_name: string | null; kv: string | null; status: string | null; delivery_district: string | null; delivery_ward: string | null };
export type DeliveryBriefRow = { driver_id: string; driver_name: string | null; total_assigned: number; delivered: number; idle_delivery_seconds: number };
export type BriefingInput = {
  day: string; now: string; sources: BriefingSource[];
  profiles: BriefingProfile[] | null;
  delivery: DeliveryBriefRow[] | null;
  pickup: PickupRider[] | null;
  team: { staff: Staff[]; shifts: StaffShift[] } | null;
};
export type BriefingTask = { id: string; priority: "high" | "normal"; title: string; detail: string; href: string; source: string };
const n = (value: number) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const fmt = (value: number | null) => value === null ? "Chưa có dữ liệu" : value.toLocaleString("vi-VN");
const fold = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLowerCase();
const stateLabels: Record<SourceState, string> = { ready: "Đã tải", stale: "Dữ liệu cũ", missing: "Chưa có dữ liệu", forbidden: "Không có quyền", error: "Lỗi nguồn" };
const atTime = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "chưa có thời điểm";

export function snapshotState(at: string | null, day: string, now: string): SourceState {
  const time = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(time)) return "missing";
  const snapshotDay = new Date(time + 7 * 3600000).toISOString().slice(0, 10);
  return snapshotDay !== day || Date.parse(now) - time > 20 * 60000 || time > Date.parse(now) + 60000 ? "stale" : "ready";
}

export function buildBriefing(input: BriefingInput, question = "") {
  const { day, now: generatedAt, sources } = input, nextDay = addDays(day, 1);
  const ready = (id: string) => sources.some(s => s.id === id && s.state === "ready");
  const profiles = ready("riders") ? input.profiles : null;
  const profileMap = new Map((profiles ?? []).map(row => [row.rider_code, row]));
  const delivery = ready("delivery") && input.delivery ? input.delivery.flatMap(row => {
    const profile = profileMap.get(row.driver_id);
    if (!profile?.kv || !OPERATING_AREAS.includes(profile.kv as typeof OPERATING_AREAS[number])) return [];
    return [{ id: row.driver_id, name: profile.full_name || row.driver_name || row.driver_id, area: profile.kv as typeof OPERATING_AREAS[number],
      assigned: n(row.total_assigned), completed: n(row.delivered), pending: Math.max(0, n(row.total_assigned) - n(row.delivered)), idle: n(row.idle_delivery_seconds) }];
  }) : null;
  const pickup = ready("pickup") && input.pickup ? input.pickup.filter(row => row.metrics !== null).map(row => ({
    id: row.id, name: row.name, area: row.area, assigned: n(row.metrics!.assigned), completed: n(row.metrics!.picked),
    pending: pendingPickup({ assigned: n(row.metrics!.assigned), picked: n(row.metrics!.picked), onhold: n(row.metrics!.onhold) }),
  })) : null;
  const team = ready("team") ? input.team : null;
  const staff = team?.staff.filter(row => row.role === "FTE" && !row.archived && row.status.toLowerCase() === "active") ?? [];
  const shifts = new Map(team?.shifts.map(row => [`${row.staff_id}:${row.work_date}`, row.shift]) ?? []);
  function staffing(date: string, area?: string) {
    if (!team) return null;
    const people = staff.filter(row => !area || row.areas.includes(area));
    const kinds = people.map(row => shiftKind(shifts.get(`${row.id}:${date}`) ?? ""));
    return { date, total: people.length, working: kinds.filter(k => k === "work").length,
      off: kinds.filter(k => k === "off" || k === "leave").length, mixed: kinds.filter(k => k === "mixed").length,
      unknown: kinds.filter(k => k === "empty" || k === "other").length };
  }
  const totals = (rows: typeof pickup) => rows === null ? null : rows.reduce((a, row) => ({ assigned: a.assigned + row.assigned, completed: a.completed + row.completed, pending: a.pending + row.pending }), { assigned: 0, completed: 0, pending: 0 });
  const areas = OPERATING_AREAS.map(area => ({ area,
    delivery: totals(delivery?.filter(row => row.area === area) ?? null), pickup: totals(pickup?.filter(row => row.area === area) ?? null),
    fteToday: staffing(day, area), fteTomorrow: staffing(nextDay, area),
  }));
  const tasks: BriefingTask[] = [];
  for (const source of sources) if (["stale", "missing", "error"].includes(source.state)) tasks.push({ id: `source:${source.id}`, priority: "high", title: `Kiểm tra nguồn ${source.label}`, detail: source.note, href: source.href, source: source.id });
  for (const area of areas) {
    const idle = delivery?.filter(row => row.area === area.area && row.pending > 0 && row.idle >= 3600) ?? [];
    if (idle.length) tasks.push({ id: `idle:${area.area}`, priority: "high", title: `${area.area}: ${idle.length} rider cần kiểm tra tiến độ giao`, detail: "Còn đơn giao và thời gian không giao từ 60 phút. Kiểm tra tình trạng thực tế trước khi điều phối.", href: assistantHref("/realtime-dashboard", area.area), source: "delivery" });
    const waiting = pickup?.filter(row => row.area === area.area && row.pending >= 50) ?? [];
    if (waiting.length) tasks.push({ id: `pickup:${area.area}`, priority: "normal", title: `${area.area}: ${waiting.length} rider còn từ 50 đơn Pickup`, detail: `${waiting.reduce((sum, row) => sum + row.pending, 0).toLocaleString("vi-VN")} lượt gán chờ lấy ở nhóm này; có thể trùng đơn giữa các rider.`, href: assistantHref("/pickup-realtime", area.area), source: "pickup" });
    const missing = profiles?.filter(row => row.status === "active" && row.kv === area.area && (!row.delivery_district?.trim() || !row.delivery_ward?.trim())) ?? [];
    if (missing.length && sources.find(s => s.id === "riders")?.href === "/riders") tasks.push({ id: `coverage:${area.area}`, priority: "normal", title: `${area.area}: ${missing.length} rider thiếu địa bàn giao`, detail: "Thiếu quận hoặc phường giao trong danh bạ. Kiểm tra và bổ sung từ Plan.", href: assistantHref("/riders", area.area), source: "riders" });
    if (area.fteTomorrow?.unknown) tasks.push({ id: `fte:${area.area}`, priority: "normal", title: `${area.area}: ${area.fteTomorrow.unknown} FTE chưa rõ ca ngày mai`, detail: `${nextDay}: ô trống hoặc mã ca chưa nhận diện; không được tính là OFF hay đã đi làm. Coverage nhiều KV có thể xuất hiện ở nhiều khu vực.`, href: assistantHref("/team", area.area, nextDay), source: "team" });
  }
  tasks.sort((a, b) => Number(a.priority !== "high") - Number(b.priority !== "high") || a.id.localeCompare(b.id));
  const top = (rows: typeof pickup) => rows === null ? null : OPERATING_AREAS.flatMap(area => rows.filter(row => row.area === area).sort((a, b) => b.pending - a.pending || a.id.localeCompare(b.id)).slice(0, 5));
  const q = fold(question);
  const matches = (rows: typeof pickup) => rows?.filter(row => q.includes(fold(row.id)) || (row.name.length >= 5 && q.includes(fold(row.name)))).slice(0, 20) ?? [];
  const summary = { delivery: totals(delivery), pickup: totals(pickup), fteToday: staffing(day), fteTomorrow: staffing(nextDay),
    pickupOnhold: ready("pickup") && input.pickup ? input.pickup.reduce((sum, row) => sum + (row.metrics ? n(row.metrics.onhold) : 0), 0) : null,
    pickupWithoutMetrics: ready("pickup") && input.pickup ? input.pickup.filter(row => row.metrics === null).length : null };
  const report = [
    `BÁO CÁO GIAO CA · ${day} · KV1–KV5`,
    `Tạo lúc: ${atTime(generatedAt)} · giờ Việt Nam.`,
    `Delivery: gán ${fmt(summary.delivery?.assigned ?? null)} · đã giao ${fmt(summary.delivery?.completed ?? null)} · còn ${fmt(summary.delivery?.pending ?? null)}.`,
    `Pickup: gán ${fmt(summary.pickup?.assigned ?? null)} · đã lấy ${fmt(summary.pickup?.completed ?? null)} · chờ lấy ${fmt(summary.pickup?.pending ?? null)} · Onhold ${fmt(summary.pickupOnhold)}. Chờ lấy = gán − đã lấy − Onhold, tối thiểu 0. Lượt gán có thể trùng đơn giữa rider.`,
    `FTE ${day}: ${fmt(summary.fteToday?.working ?? null)} ca làm đầy đủ; ${fmt(summary.fteToday?.off ?? null)} nghỉ OFF/phép; ${fmt(summary.fteToday?.mixed ?? null)} ca kèm nghỉ; ${fmt(summary.fteToday?.unknown ?? null)} chưa rõ ca.`,
    `FTE ${nextDay}: ${fmt(summary.fteTomorrow?.working ?? null)} ca làm đầy đủ; ${fmt(summary.fteTomorrow?.unknown ?? null)} chưa rõ ca.`,
    "", "ƯU TIÊN KIỂM TRA:",
    ...(tasks.length ? tasks.map((task, i) => `${i + 1}. ${task.title}. ${task.detail}`) : ["Chưa phát hiện cảnh báo theo các quy tắc trên nguồn khả dụng; cần đối chiếu thực tế."]),
    "", "NGUỒN:", ...sources.map(source => `${source.label}: ${stateLabels[source.state]} · ${atTime(source.at)} · ${source.note}`),
    "Nguồn lỗi, cũ hoặc không có quyền xem không được tính là số 0. Không tự động đổi lịch, phân công hay sửa dữ liệu.",
  ].join("\n");
  return { day, nextDay, generatedAt, sources, summary, areas, tasks, report,
    rankings: { delivery: top(delivery), pickup: top(pickup), limitPerArea: 5, note: "Top 5 rider mỗi KV theo số đơn còn lại; không phải danh sách đầy đủ." },
    matchedRiders: { delivery: matches(delivery), pickup: matches(pickup), limit: 20 },
    rules: { staleAfterMinutes: 20, deliveryIdleMinutes: 60, pickupPending: 50 },
  };
}
export type OperationsBriefing = ReturnType<typeof buildBriefing>;
