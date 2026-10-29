import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getCurrentUserContext } from "@/lib/auth/current-user";

export async function GET() {
  const context = await getCurrentUserContext().catch(() => null);
  if (!context) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  try {
    if (!process.env.LOCALAPPDATA) throw Error("Missing sync host");
    const status = JSON.parse(await readFile(join(process.env.LOCALAPPDATA, "SDD", "rider-sheet-sync", "status.json"), "utf8"));
    return NextResponse.json({ ...status, stale: !status.checkedAt || Date.now() - Date.parse(status.checkedAt) > 180000 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ status: "UNAVAILABLE", error: "Chưa có trạng thái đồng bộ trên máy chủ này." }, { headers: { "Cache-Control": "private, no-store" } });
  }
}
