import { z } from "zod";

export const vitalSampleSchema = z.object({
  metric_id: z.string().min(1).max(100),
  name: z.enum(["LCP", "INP", "CLS", "FCP", "TTFB"]),
  value: z.number().finite().min(0).max(300000),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  path: z.string().min(1).max(160).regex(/^\/(?!\/)[^?#]*$/),
  device: z.enum(["mobile", "desktop"]),
});
export type VitalSample = z.infer<typeof vitalSampleSchema>;
export type VitalSummary = Pick<VitalSample, "path" | "device" | "name"> & { p75: number; samples: number };
export function vitalRating(name: string, value: number) {
  const limits: Record<string, [number, number]> = { LCP: [2500, 4000], INP: [200, 500], CLS: [0.1, 0.25], FCP: [1800, 3000], TTFB: [800, 1800] };
  const [good, poor] = limits[name] ?? [0, 0];
  return value <= good ? "good" : value <= poor ? "needs-improvement" : "poor";
}
