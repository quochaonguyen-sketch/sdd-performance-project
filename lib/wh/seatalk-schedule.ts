const vietnamClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const hhmm = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

export function whSeatalkSchedule(env: NodeJS.ProcessEnv) {
  const times = [...new Set((env.SPX_COT_TIMES || "07:30,10:30,12:30,14:30,17:00").split(",").map(time => time.trim()))];
  if (times.some(time => !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new Error("SPX_COT_TIMES phải có dạng HH:mm,HH:mm.");

  const setting = (key: string, fallback: number, min: number) => {
    const value = Number(env[key]?.trim() || fallback);
    if (!Number.isInteger(value) || value < min || value >= 1440) throw new Error(`${key} phải là số phút hợp lệ.`);
    return value;
  };
  const offsets = [
    { kind: "dashboard", offset: setting("SPX_DASHBOARD_OFFSET_MIN", 10, 0) },
    { kind: "rider", offset: setting("SPX_RIDER_OFFSET_MIN", 120, 0) },
  ] as const;

  return {
    window: setting("SPX_SEND_WINDOW_MIN", 15, 1),
    slots: times.flatMap(time => offsets.map(({ kind, offset }) => {
      const at = minutes(time) + offset;
      return { kind, at, time: hhmm(at), key: `${kind}:${hhmm(at)}` };
    })).filter(slot => slot.at < 1440).sort((a, b) => a.at - b.at),
  };
}

export type WhSeatalkSlot = ReturnType<typeof whSeatalkSchedule>["slots"][number];

export function dueWhSeatalkSlots(schedule: ReturnType<typeof whSeatalkSchedule>, now: Date, lead = 0) {
  const minute = minutes(vietnamClock.format(now));
  return schedule.slots.filter(slot => minute >= slot.at - lead && minute < slot.at + schedule.window);
}
