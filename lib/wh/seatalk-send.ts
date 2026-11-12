import { vietnamDay } from "@/lib/data-sources/catalog";
import type { createAdminClient } from "@/lib/supabase/admin";
import { formatVnDate, type WhOrder } from "@/lib/wh/model";
import { connectSeaTalk, SeaTalkError, seaTalkImage, seatalkBotConfig, seaTalkText, seaTalkThreadId } from "@/lib/wh/seatalk-bot";
import { whSeatalkImage } from "@/lib/wh/seatalk-image";
import { whSeatalkReport, type WhSeatalkReport } from "@/lib/wh/seatalk-report";
import type { WhSeatalkSlot } from "@/lib/wh/seatalk-schedule";

type Admin = ReturnType<typeof createAdminClient>;
type Bot = NonNullable<ReturnType<typeof seatalkBotConfig>>;
type ScheduledRun = {
  report?: WhSeatalkReport;
  sent: number;
  pending: boolean;
  failures: number;
  done?: boolean;
};

export const whSeatalkHeaders = { "Cache-Control": "private, no-store" };
const json = (body: object, status = 200) => Response.json(body, { status, headers: whSeatalkHeaders });
export const whSeatalkFailure = (error: string, status: number) => json({ error }, status);

export async function loadWhSeatalkReport(admin: Admin) {
  const day = vietnamDay();
  const { data, error } = await admin.from("wh_tracking_snapshots").select("snapshot_at,orders")
    .eq("station_id", "4232").eq("report_date", day).maybeSingle();
  if (error) return whSeatalkFailure("Chưa đọc được dữ liệu HV của Hub 4232.", 503);
  if (!data) return whSeatalkFailure("Hôm nay chưa có dữ liệu HV. Hãy lấy dữ liệu WH rồi mở lại báo cáo.", 404);
  return whSeatalkReport((data.orders ?? []) as WhOrder[], day, data.snapshot_at);
}

export async function sendWhSeatalkReport(admin: Admin, bot: Bot, latest: WhSeatalkReport, options: {
  slot?: WhSeatalkSlot; retryUnconfirmed?: boolean;
} = {}) {
  const { slot, retryUnconfirmed } = options;
  const target = { group_id: bot.groupId, report_date: latest.day };
  const table = () => admin.from("wh_seatalk_reports");
  const { error: createError } = await table().upsert(target, { onConflict: "group_id,report_date", ignoreDuplicates: true });
  if (createError) return whSeatalkFailure("Chưa lưu được trạng thái báo cáo HV. Kiểm tra migration SeaTalk.", 503);
  const now = Date.now();
  const lease = new Date(now + 120_000).toISOString();
  const { data: progress, error: lockError } = await table().update({ lease_until: lease })
    .match(target).or(`lease_until.is.null,lease_until.lt.${new Date(now).toISOString()}`)
    .select("thread_id,thread_pending,snapshot_at,sent_count,awaiting_confirmation,scheduled_runs").maybeSingle();
  if (lockError) return whSeatalkFailure("Chưa đọc được trạng thái gửi báo cáo HV.", 503);
  if (!progress) return whSeatalkFailure("Một lần gửi báo cáo HV đang chạy. Hãy thử lại sau.", 409);

  const locked = { ...target, lease_until: lease };
  async function save(values: Record<string, unknown>) {
    const { data, error } = await table().update(values).match(locked).select("report_date").maybeSingle();
    if (error || !data) throw new SeaTalkError("Chưa lưu được tiến độ gửi.");
  }

  const runs = (progress.scheduled_runs ?? {}) as Record<string, ScheduledRun>;
  const run = slot ? runs[slot.key] ?? { sent: 0, pending: false, failures: 0 } : undefined;
  const report = run?.report ?? latest;
  const imageCount = slot?.kind === "dashboard" ? 1 : report.riders.length + (slot ? 0 : 1);
  const sameSnapshot = progress.snapshot_at === report.snapshotAt;
  let sent = run?.sent ?? (sameSnapshot ? progress.sent_count : 0);
  const initialSent = sent;
  let pending = false;
  let threadId = progress.thread_id as string | null;

  async function saveDelivery(sentCount: number, unconfirmed: boolean, done = false) {
    if (slot && run) {
      const finished = done || run.failures >= 3;
      await save({ scheduled_runs: { ...runs, [slot.key]: {
        sent: sentCount, pending: unconfirmed, failures: run.failures, done,
        // Keep the same data if a later tick has to resume a partially sent report.
        report: finished || unconfirmed ? undefined : report,
      } satisfies ScheduledRun } });
    } else {
      await save({ snapshot_at: report.snapshotAt, sent_count: sentCount, awaiting_confirmation: unconfirmed });
    }
  }

  try {
    if (run && (run.done || run.pending || run.failures >= 3)) return json({ skipped: true });
    if (!slot && progress.snapshot_at && Date.parse(progress.snapshot_at) > Date.parse(report.snapshotAt)) {
      return whSeatalkFailure("Đã có báo cáo HV mới hơn. Hãy tải lại bản xem trước.", 409);
    }
    const unconfirmedThread = progress.thread_pending || (!threadId && progress.awaiting_confirmation);
    if (!retryUnconfirmed && (unconfirmedThread || (!slot && progress.awaiting_confirmation))) {
      return json({
        error: "SeaTalk chưa xác nhận mục cuối. Hãy kiểm tra nhóm trước khi gửi lại vì mục này có thể đã đến nhóm.",
        unconfirmed: true,
      }, 409);
    }
    if (sent === imageCount + 1) return json({ images: imageCount, alreadySent: true });

    const send = await connectSeaTalk(bot);
    await saveDelivery(sent, false);
    if (unconfirmedThread) threadId = null;

    async function startThread() {
      await save({ thread_pending: true });
      pending = true;
      let id: string;
      try {
        const title = `**SPX High Value · Hub 4232**\nNgày báo cáo ${formatVnDate(target.report_date)}`;
        id = seaTalkThreadId(await send(seaTalkText(title)));
      } catch (error) {
        if (error instanceof SeaTalkError && !error.uncertain) {
          await save({ thread_pending: false });
          pending = false;
        }
        throw error;
      }
      await save({ thread_id: id, thread_pending: false });
      pending = false;
      await new Promise(resolve => setTimeout(resolve, 900));
      return id;
    }

    async function deliver(message: Parameters<typeof send>[0], replyTo: string) {
      await saveDelivery(sent, true);
      pending = true;
      try {
        await send(message, replyTo);
      } catch (error) {
        if (error instanceof SeaTalkError && !error.uncertain) {
          await saveDelivery(sent, false);
          pending = false;
        }
        throw error;
      }
    }

    const t = report.totals;
    const title = slot?.kind === "dashboard" ? "Dashboard" : slot?.kind === "rider" ? "Rider Delivery" : "Dashboard & Rider Delivery";
    const scheduleLabel = slot ? `Giờ theo lịch ${slot.time} (UTC+7)\n` : "";
    const totals = slot?.kind === "rider" ? `Tổng **${t.total}** đơn`
      : `Total **${t.total}** · Delivered **${t.delivered}** (${t.rate.toFixed(1)}%) · On-Hold **${t.onhold}** · Late **${t.late}**`;
    const caption = seaTalkText(`**SPX High Value · ${title}**\n${scheduleLabel}${report.stamp}\n${totals}`);
    let replacedThread = false;
    while (sent <= imageCount) {
      if (Date.now() - now > 38_000) {
        if (sent === initialSent) return whSeatalkFailure("Hết thời gian gửi báo cáo HV. Hãy thử lại.", 503);
        return json({ images: sent - 1 }, 202);
      }
      const index = slot?.kind === "rider" ? sent : sent - 1;
      const message = sent === 0 ? caption : seaTalkImage(await whSeatalkImage(report, index).arrayBuffer());
      threadId ??= await startThread();
      try {
        await deliver(message, threadId);
      } catch (error) {
        if (!(error instanceof SeaTalkError) || error.code !== 4010 || pending || replacedThread || sent !== 0) throw error;
        replacedThread = true;
        threadId = await startThread();
        await deliver(message, threadId);
      }
      await saveDelivery(sent + 1, false, sent === imageCount);
      sent += 1;
      pending = false;
    }
    return json({ images: imageCount, alreadySent: false });
  } catch (error) {
    if (run && !pending) {
      run.failures += 1;
      await saveDelivery(sent, false);
    }
    const reason = pending ? "SeaTalk chưa xác nhận mục cuối. Hãy kiểm tra nhóm trước khi gửi lại vì mục này có thể đã đến nhóm."
      : error instanceof SeaTalkError ? error.message : "Chưa tạo được ảnh báo cáo HV.";
    return json({ error: `Đã xác nhận ${Math.max(0, sent - 1)}/${imageCount} ảnh. ${reason}`, unconfirmed: pending }, 502);
  } finally {
    await table().update({ lease_until: null }).match(locked);
  }
}
