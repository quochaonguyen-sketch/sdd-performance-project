export function overnightCutoffDay(now = new Date()) {
  const local = new Date(now.getTime() + 7 * 3600000);
  if (local.getUTCHours() < 23) local.setUTCDate(local.getUTCDate() - 1);
  return local.toISOString().slice(0, 10);
}
