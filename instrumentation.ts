import { PHASE_PRODUCTION_BUILD } from "next/constants";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) return;
  if (!/^(1|true)$/i.test(process.env.SPX_SEATALK_SCHEDULE_ENABLED ?? "")) return;
  const { startWhSeatalkScheduler } = await import("./lib/wh/seatalk-scheduler");
  startWhSeatalkScheduler();
}
