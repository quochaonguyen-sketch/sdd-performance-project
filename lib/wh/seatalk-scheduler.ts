import { vietnamDay } from "@/lib/data-sources/catalog";
import { createAdminClient } from "@/lib/supabase/admin";
import { seatalkBotConfig } from "@/lib/wh/seatalk-bot";
import { dueWhSeatalkSlots, whSeatalkSchedule } from "@/lib/wh/seatalk-schedule";
import { loadWhSeatalkReport, sendWhSeatalkReport } from "@/lib/wh/seatalk-send";

const state = globalThis as typeof globalThis & { whSeatalkTimer?: NodeJS.Timeout };

export function startWhSeatalkScheduler() {
  if (state.whSeatalkTimer) return;
  const bot = seatalkBotConfig();
  if (!bot) {
    console.warn("[WH SeaTalk] Thiếu cấu hình bot. Lịch gửi HV chưa chạy.");
    return;
  }
  let schedule: ReturnType<typeof whSeatalkSchedule>;
  try {
    schedule = whSeatalkSchedule(process.env);
  } catch (error) {
    console.warn("[WH SeaTalk]", error instanceof Error ? error.message : "Cấu hình giờ gửi không hợp lệ.");
    return;
  }

  let running = false;
  let refreshRequestedFor = "";
  const tick = async () => {
    if (running) return;
    const now = new Date();
    const due = dueWhSeatalkSlots(schedule, now);
    const next = due[0] ?? dueWhSeatalkSlots(schedule, now, 5)[0];
    if (!next) return;
    running = true;
    try {
      const admin = createAdminClient();
      const report = await loadWhSeatalkReport(admin);
      if (report instanceof Response) {
        const day = vietnamDay();
        const key = `${day}/${next.key}`;
        if (report.status === 404 && refreshRequestedFor !== key) {
          const { error } = await admin.rpc("control_data_source", {
            p_source: "wh_tracking", p_action: "run", p_day: day, p_actor: null,
          });
          if (!error) refreshRequestedFor = key;
          else console.warn("[WH SeaTalk] Chưa xếp hàng lấy dữ liệu HV.");
        } else if (report.status !== 404) {
          console.warn("[WH SeaTalk] Chưa đọc được dữ liệu HV cho lịch gửi.");
        }
        return;
      }

      for (const slot of due) {
        const result = await sendWhSeatalkReport(admin, bot, report, { slot });
        const body = await result.json();
        if (result.status === 202 || body.skipped || body.alreadySent) continue;
        if (result.ok) console.info(`[WH SeaTalk] Đã gửi ${slot.key}, ${body.images} ảnh.`);
        else console.warn(`[WH SeaTalk] ${slot.key} · ${body.error}`);
      }
    } catch {
      console.warn("[WH SeaTalk] Lượt kiểm tra lịch bị gián đoạn. Sẽ kiểm tra lại ở lượt sau.");
    } finally {
      running = false;
    }
  };

  state.whSeatalkTimer = setInterval(() => void tick(), 60_000).unref();
  console.info(`[WH SeaTalk] Lịch gửi HV đã bật (UTC+7) · ${schedule.slots.map(slot => slot.key).join(", ")}`);
  void tick();
}
