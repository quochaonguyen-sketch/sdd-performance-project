import { z } from "zod";

export const feedbackStatuses = { OPEN: "Đã tiếp nhận", IN_PROGRESS: "Đang xử lý", RESOLVED: "Đã hoàn tất", CLOSED: "Đã đóng" } as const;
export const feedbackSchema = z.object({
  kind: z.enum(["BUG", "SUGGESTION"]),
  title: z.string().trim().min(3).max(160),
  content: z.string().trim().min(10).max(5000),
  page_path: z.string().trim().max(300).refine(value => !value || (value.startsWith("/") && !value.startsWith("//")), "Nhập đường dẫn bắt đầu bằng /.").default(""),
});
export const reviewSchema = z.object({ status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]), response: z.string().trim().max(5000) });
export const updateSchema = z.object({ title: z.string().trim().min(3).max(160), content: z.string().trim().min(10).max(5000) });
export type Feedback = z.infer<typeof feedbackSchema> & { id: string; user_id: string; author_name: string; status: keyof typeof feedbackStatuses; response: string; created_at: string };
export type ProductUpdate = z.infer<typeof updateSchema> & { id: string; created_at: string; read: boolean };
export type FeedbackNotification = { id: string; feedback_id: string; title: string; response: string; status: keyof typeof feedbackStatuses; created_at: string; read: boolean };
