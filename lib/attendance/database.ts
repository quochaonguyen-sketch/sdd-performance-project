import "server-only";
import { createOHArchiveClient } from "@/lib/onhold/archive";

export function createAttendanceClient() {
  const client = createOHArchiveClient();
  if (!client) throw Error("Chưa cấu hình Supabase 2 cho lịch rider.");
  return client;
}
