/**
 * lib/admin/latest-audit.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The newest audit entry per record, for "last edited by" columns.
 *
 * `findMany({ distinct: ["recordId"] })` looks like one query but Prisma
 * applies `distinct` in memory: it fetched every audit row ever written
 * for those records. This groups in the database first (one row per
 * record), then reads only the newest entries.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";

export type LatestAudit = {
  recordId: string;
  createdAt: Date;
  actorEmail: string;
  actor: { name: string } | null;
};

export async function latestAuditByRecord(model: string, recordIds: string[]): Promise<LatestAudit[]> {
  if (recordIds.length === 0) return [];
  const newest = await prisma.auditLog.groupBy({
    by: ["recordId"],
    where: { model, recordId: { in: recordIds } },
    _max: { createdAt: true },
  });
  const stamps = newest.filter((row) => row.recordId && row._max.createdAt);
  if (stamps.length === 0) return [];
  const rows = await prisma.auditLog.findMany({
    where: {
      model,
      OR: stamps.map((row) => ({ recordId: row.recordId, createdAt: row._max.createdAt as Date })),
    },
    orderBy: { createdAt: "desc" },
    select: { recordId: true, createdAt: true, actorEmail: true, actor: { select: { name: true } } },
  });
  // Two entries can share a timestamp: keep the first (newest id order).
  const byRecord = new Map<string, LatestAudit>();
  for (const row of rows) {
    if (row.recordId && !byRecord.has(row.recordId)) byRecord.set(row.recordId, row as LatestAudit);
  }
  return [...byRecord.values()];
}
