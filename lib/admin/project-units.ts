import "server-only";

/**
 * lib/admin/project-units.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read side of the admin Units & Site Plan page (Units.dc.html) — every
 * plot on one project, grouped by sales phase, with the facts the page
 * shows about a selected one: its type and areas, which way it faces, who
 * is holding it and until when.
 *
 * The reservation half of this (reservedByLead / reservedBy /
 * reservationExpiresAt) already exists: it was added for the Lead Detail
 * page's "unit of interest" picker, which was explicitly built as a
 * stand-in until this page could show the other side of the same link.
 * Nothing new is stored here for it — this is the same three columns,
 * read from the unit's end instead of the lead's.
 *
 * "Last updated by" comes from AuditLog, one batched query for the whole
 * project rather than one per row — see lib/admin/project-list.ts, which
 * reads the same trail the same way for projects.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { UnitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

/** Prisma model name as the audit trail records it. */
const AUDIT_MODEL = "ProjectUnit";

export type UnitRow = {
  id: string;
  unitNumber: string;
  status: UnitStatus;
  releasedForSale: boolean;
  phase: number | null;
  unitTypeId: string | null;
  unitTypeName: string | null;
  /** From the unit *type* — the floor area is a property of the design,
   *  not of the individual plot. */
  livingAreaSqm: number | null;
  bedrooms: number | null;
  /** The plot's own land area, which does vary between plots. */
  landAreaSqm: number | null;
  facing: string | null;
  viewLabel: string | null;
  priceTHB: number | null;
  adminNotes: string | null;
  /** Traced boundary on the master plan, as 0-100 percentages of the
   *  image — see ProjectUnit.shapePoints. Null until someone traces it,
   *  which is the case for every seeded unit. */
  shapePoints: { x: number; y: number }[] | null;
  positionXPercent: number | null;
  positionYPercent: number | null;
  reservedByLead: { id: string; name: string } | null;
  reservedByName: string | null;
  reservationExpiresAt: Date | null;
  updatedAt: Date;
  lastEditedBy: string | null;
  lastEditedAt: Date | null;
};

export type PhaseGroup = {
  /** Null groups every plot on a project that does not release in stages. */
  phase: number | null;
  units: UnitRow[];
  releasedCount: number;
  /** True when the whole phase is still held back — the "เฟส 2 (8 ยูนิต)
   *  ยังไม่เปิดขาย" line under the site plan. */
  allUnreleased: boolean;
};

export type UnitStatusCounts = {
  available: number;
  reserved: number;
  sold: number;
  /** Not one of the three sale statuses — see ProjectUnit.releasedForSale. */
  unreleased: number;
};

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function countUnits(units: UnitRow[]): UnitStatusCounts {
  const counts: UnitStatusCounts = { available: 0, reserved: 0, sold: 0, unreleased: 0 };

  for (const unit of units) {
    // Release state is checked first on purpose: an unreleased plot keeps
    // whatever UnitStatus it was seeded with, and counting it as
    // "available" is exactly the overstatement releasedForSale exists to
    // prevent.
    if (!unit.releasedForSale) counts.unreleased += 1;
    else if (unit.status === UnitStatus.AVAILABLE) counts.available += 1;
    else if (unit.status === UnitStatus.RESERVED) counts.reserved += 1;
    else counts.sold += 1;
  }

  return counts;
}

/** Phases in release order, with the unphased group (null) last. */
export function groupByPhase(units: UnitRow[]): PhaseGroup[] {
  const byPhase = new Map<number | null, UnitRow[]>();

  for (const unit of units) {
    const list = byPhase.get(unit.phase) ?? [];
    list.push(unit);
    byPhase.set(unit.phase, list);
  }

  return [...byPhase.entries()]
    .sort(([a], [b]) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a - b;
    })
    .map(([phase, phaseUnits]) => {
      const releasedCount = phaseUnits.filter((unit) => unit.releasedForSale).length;
      return {
        phase,
        units: phaseUnits,
        releasedCount,
        allUnreleased: releasedCount === 0,
      };
    });
}

export async function getAdminProjectUnits(projectId: string): Promise<UnitRow[]> {
  return safeQuery(
    "admin:project:units",
    async () => {
      const units = await prisma.projectUnit.findMany({
        where: { projectId },
        orderBy: [{ phase: "asc" }, { sortOrder: "asc" }, { unitNumber: "asc" }],
        select: {
          id: true,
          unitNumber: true,
          status: true,
          releasedForSale: true,
          phase: true,
          unitTypeId: true,
          landAreaSqm: true,
          facing: true,
          viewLabel: true,
          priceTHB: true,
          adminNotes: true,
          shapePoints: true,
          positionXPercent: true,
          positionYPercent: true,
          reservationExpiresAt: true,
          updatedAt: true,
          unitType: { select: { name: true, livingAreaSqm: true, bedrooms: true } },
          reservedByLead: { select: { id: true, name: true } },
          reservedBy: { select: { name: true } },
        },
      });

      const audits = units.length
        ? await prisma.auditLog.findMany({
            where: { model: AUDIT_MODEL, recordId: { in: units.map((unit) => unit.id) } },
            orderBy: { createdAt: "desc" },
            distinct: ["recordId"],
            select: {
              recordId: true,
              createdAt: true,
              actorEmail: true,
              actor: { select: { name: true } },
            },
          })
        : [];

      const auditByUnit = new Map(audits.map((entry) => [entry.recordId, entry]));

      return units.map((unit): UnitRow => {
        const audit = auditByUnit.get(unit.id);
        return {
          id: unit.id,
          unitNumber: unit.unitNumber,
          status: unit.status,
          releasedForSale: unit.releasedForSale,
          phase: unit.phase,
          unitTypeId: unit.unitTypeId,
          unitTypeName: unit.unitType?.name ?? null,
          livingAreaSqm: toNumber(unit.unitType?.livingAreaSqm),
          bedrooms: unit.unitType?.bedrooms ?? null,
          landAreaSqm: toNumber(unit.landAreaSqm),
          facing: unit.facing,
          viewLabel: unit.viewLabel,
          priceTHB: toNumber(unit.priceTHB),
          adminNotes: unit.adminNotes,
          shapePoints: (unit.shapePoints as { x: number; y: number }[] | null) ?? null,
          positionXPercent: toNumber(unit.positionXPercent),
          positionYPercent: toNumber(unit.positionYPercent),
          reservedByLead: unit.reservedByLead,
          reservedByName: unit.reservedBy?.name ?? null,
          reservationExpiresAt: unit.reservationExpiresAt,
          updatedAt: unit.updatedAt,
          // Time and name from the same entry, or neither — see the same
          // note in lib/admin/project-list.ts.
          lastEditedBy: audit ? (audit.actor?.name ?? audit.actorEmail) : null,
          lastEditedAt: audit?.createdAt ?? null,
        };
      });
    },
    [],
  );
}
