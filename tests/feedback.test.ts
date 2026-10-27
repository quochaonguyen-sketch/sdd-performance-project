import test from "node:test";
import assert from "node:assert/strict";
import { feedbackSchema, reviewSchema, updateSchema } from "../lib/feedback/model.ts";
import { feedbackListSchema, feedbackSearchFilter, FEEDBACK_PAGE_SIZE } from "../lib/feedback/query.ts";

const feedback = { kind: "BUG", title: "  Lỗi rider  ", content: "Không tải được danh sách rider.", page_path: "/riders" };
test("feedback validates input and strips client-supplied ownership and status", () => {
  const parsed = feedbackSchema.parse({ ...feedback, user_id: "another-user", status: "RESOLVED" });
  assert.equal(parsed.title, "Lỗi rider");
  assert.equal("user_id" in parsed, false);
  assert.equal("status" in parsed, false);
  for (const page_path of ["https://example.com", "//example.com", "javascript:alert(1)"]) assert.equal(feedbackSchema.safeParse({ ...feedback, page_path }).success, false);
  assert.equal(feedbackSchema.safeParse({ ...feedback, page_path: "" }).success, true);
});
test("feedback and announcements reject blank, excessive or invalid fields", () => {
  assert.equal(feedbackSchema.safeParse({ ...feedback, content: "   " }).success, false);
  assert.equal(feedbackSchema.safeParse({ ...feedback, title: "a".repeat(161) }).success, false);
  assert.equal(feedbackSchema.safeParse({ ...feedback, kind: "ADMIN" }).success, false);
  assert.equal(updateSchema.safeParse({ title: "Bản sửa lỗi", content: "a".repeat(5001) }).success, false);
  assert.equal(reviewSchema.safeParse({ status: "UNKNOWN", response: "" }).success, false);
  assert.equal(reviewSchema.safeParse({ status: "RESOLVED", response: "Đã sửa lỗi tải danh sách." }).success, true);
});

test("feedback pagination validates bounds and search values cannot escape the filter", () => {
  assert.equal(FEEDBACK_PAGE_SIZE, 20);
  assert.deepEqual(feedbackListSchema.parse({}), { page: 1, status: "ALL", search: "", feedback_id: "" });
  assert.deepEqual(feedbackListSchema.parse({ page: "2", status: "OPEN", search: " rider " }), { page: 2, status: "OPEN", search: "rider", feedback_id: "" });
  for (const page of ["0", "-1", "1.5", "NaN", "100001"]) assert.equal(feedbackListSchema.safeParse({ page }).success, false);
  assert.equal(feedbackListSchema.safeParse({ status: "INVALID" }).success, false);
  assert.equal(feedbackListSchema.safeParse({ search: "x".repeat(161) }).success, false);
  assert.equal(feedbackSearchFilter('a,b.(c)"%_\\'), 'title.ilike."%a,b.(c)\\"\\%\\_\\\\%",content.ilike."%a,b.(c)\\"\\%\\_\\\\%"');
});
