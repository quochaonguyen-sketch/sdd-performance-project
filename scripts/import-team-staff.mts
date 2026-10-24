import fs from "node:fs";
import { PrismaClient } from "@prisma/client";
import { parseStaffCsv } from "../lib/team/import.ts";
import path from "node:path";

const file = process.argv[2];
if (!file) throw new Error("Pass the source CSV path.");
const parsed = parseStaffCsv(fs.readFileSync(file, "utf8"), path.basename(file));
const summary = { staff: parsed.staff.length, shifts: parsed.shifts.length, from: parsed.start, to: parsed.end, current: parsed.staff.filter(p => !p.archived && p.status === "Active").length, warnings: parsed.warnings };
if (process.argv.includes("--apply")) {
  const db = new PrismaClient();
  try {
    const result = await db.$transaction(async tx => {
      const imported = await tx.$queryRawUnsafe("select public.import_team_roster($1::jsonb,$2::text) as imported", JSON.stringify({ staff: parsed.staff, shifts: parsed.shifts }), path.basename(file));
      await tx.$executeRawUnsafe("insert into public.user_activity_logs(actor_name,event_type,entity_type,summary,changes) values ($1,'import','team_staff',$2,$3::jsonb)",
        "Hệ thống · nhập CSV", `Nhập nhân sự và lịch: ${path.basename(file)}`, JSON.stringify(summary));
      return imported;
    }, { timeout: 60000 });
    console.log(JSON.stringify(result));
  } finally { await db.$disconnect(); }
}
console.log(JSON.stringify(summary));
