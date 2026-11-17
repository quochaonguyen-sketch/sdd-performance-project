import type { Prisma, PrismaClient } from "@prisma/client";
import { matchChurnedRiders, RIDER_CHURN_TAB, type RiderChurnReport } from "../dashboard/rider-churn.ts";
import { OPERATING_AREAS, type OperatingArea } from "../locations/operating-areas.ts";

export async function getRiderChurnReport(
  db: Pick<Prisma.TransactionClient, "rider">,
  churnedIds: string[],
  editableAreas: readonly string[],
): Promise<RiderChurnReport> {
  const roster = await db.rider.findMany({
    where: { kv: { in: [...OPERATING_AREAS] } },
    select: { riderCode: true, kv: true, status: true },
  });
  const rows = matchChurnedRiders(churnedIds, roster).map(rider => ({
    riderId: rider.riderCode.trim(),
    status: rider.status,
    canDeactivate: rider.status === "active" && editableAreas.includes(rider.kv ?? ""),
  }));
  rows.sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || a.riderId.localeCompare(b.riderId));
  return { rows, checkedAt: new Date().toISOString() };
}

export async function reconcileRiderChurn(
  db: Pick<PrismaClient, "$transaction">,
  churnedIds: string[],
  reviewedIds: string[],
  editableAreas: readonly OperatingArea[],
  actorId: string | null,
) {
  const selected = new Set(reviewedIds);
  const sourceIds = churnedIds.filter(id => selected.has(id));
  return db.$transaction(async tx => {
    const scope = { kv: { in: [...editableAreas] }, status: "active" };
    const roster = await tx.rider.findMany({ where: scope, select: { riderCode: true } });
    const matched = matchChurnedRiders(sourceIds, roster);
    const updated = matched.length ? await tx.rider.updateManyAndReturn({
      where: { ...scope, riderCode: { in: matched.map(rider => rider.riderCode) } },
      data: { status: "inactive" },
      select: { id: true, riderCode: true },
    }) : [];
    if (updated.length) {
      await tx.activityLog.createMany({ data: updated.map(rider => ({
        entityType: "rider",
        entityId: rider.id,
        action: "updated",
        message: `Rider ${rider.riderCode.trim()} đã nghỉ việc theo ${RIDER_CHURN_TAB}`,
        rawData: { source: RIDER_CHURN_TAB, rider_code: rider.riderCode.trim(), status: "inactive", actor_id: actorId },
      })) });
    }
    return { updated: updated.length, report: await getRiderChurnReport(tx, churnedIds, editableAreas) };
  });
}
