export function metricPath(url: string) {
  return new URL(url).pathname.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id").slice(0, 160);
}
