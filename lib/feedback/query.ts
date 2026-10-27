import { z } from "zod";

export const FEEDBACK_PAGE_SIZE = 20;
export const feedbackListSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  status: z.enum(["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]).default("ALL"),
  search: z.string().trim().max(160).default(""),
  feedback_id: z.union([z.literal(""), z.uuid()]).default(""),
});
export type FeedbackListQuery = z.infer<typeof feedbackListSchema>;

export function feedbackSearchFilter(search: string) {
  // Quote PostgREST values and treat LIKE wildcards as literal search text.
  const escaped = search.replace(/[\\%_]/g, "\\$&").replace(/"/g, '\\"');
  return `title.ilike."%${escaped}%",content.ilike."%${escaped}%"`;
}
