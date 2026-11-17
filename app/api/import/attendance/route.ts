import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma/client";
import { createAttendanceClient } from "@/lib/attendance/database";
import { invalidateAttendanceCache } from "@/lib/cache/operations-cache";
import {
  attendanceImportItemSchema,
  importBodySchema,
  type AttendanceImportItem,
} from "@/lib/validators/import";

function toJson(value: unknown) {
  return value as never;
}

export async function POST(request: Request) {
  const headerStore = await headers();
  const secret = headerStore.get("x-import-secret");

  if (!process.env.IMPORT_SECRET || secret !== process.env.IMPORT_SECRET) {
    return NextResponse.json({ success: false, error: "Invalid import secret" }, { status: 401 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = importBodySchema(attendanceImportItemSchema).safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const records: AttendanceImportItem[] = Array.isArray(parsed.data) ? parsed.data : parsed.data.records;
  const source = Array.isArray(parsed.data) ? "python_import" : (parsed.data.source ?? "python_import");
  let inserted = 0;
  let updated = 0;
  const errors: Array<{ rider_code?: string; error: string }> = [];
  const attendance = createAttendanceClient();

  for (const record of records) {
    try {
      const rider = await prisma.rider.findUnique({
        where: { riderCode: record.rider_code },
        select: { id: true },
      });

      const day = record.work_date.toISOString().slice(0, 10);
      const key = { rider_code: record.rider_code, work_date: day };
      const existing = await attendance.from("attendance_logs").select("id").match(key).maybeSingle();
      if (existing.error) throw Error(existing.error.message);
      const { data: log, error } = await attendance.from("attendance_logs").upsert({
        ...key, rider_id: rider?.id, shift: record.shift ?? null,
        status: record.status, note: record.note ?? null, raw_data: record.raw_data ?? record,
      }, { onConflict: "rider_code,work_date" }).select("id").single();
      if (error) throw Error(error.message);
      invalidateAttendanceCache(day.slice(0, 7));

      if (existing.data) {
        updated += 1;
      } else {
        inserted += 1;
      }

      await prisma.activityLog.create({
        data: {
          entityType: "attendance_log",
          entityId: log.id,
          action: existing.data ? "updated" : "inserted",
          message: `${existing.data ? "Updated" : "Inserted"} attendance ${record.rider_code} ${day}`,
          rawData: toJson(record.raw_data ?? record),
        },
      });
    } catch (error) {
      errors.push({
        rider_code: record.rider_code,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  await prisma.importBatch.create({
    data: {
      source,
      totalRecords: records.length,
      successCount: inserted + updated,
      errorCount: errors.length,
      rawData: toJson(payload),
    },
  });

  return NextResponse.json({
    success: errors.length === 0,
    inserted,
    updated,
    errors,
  });
}
