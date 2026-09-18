"use server";

/**
 * app/[locale]/admin/projects/[id]/units/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Writes for the Units & Site Plan page (Units.dc.html): status changes,
 * the reservation workflow, creating and editing a plot, and the CSV
 * import.
 *
 * STATUS AND RESERVATION ARE ONE FACT, NOT TWO.
 *
 * Every status change here goes through reservationPatchFor() below.
 * Before this page existed, status was the only thing an admin could
 * change and the three reservation columns were written solely from the
 * Lead Detail page — so flipping a RESERVED unit back to AVAILABLE from
 * the old dropdown left `reservedByLeadId` pointing at a lead who no
 * longer had any claim on it, and the lead's own page went on showing the
 * unit as theirs. The two surfaces now agree because the clearing happens
 * on the write, not in whichever screen remembers to do it.
 *
 * Deleting a unit is deliberately absent: a plot is a physical thing that
 * exists whether or not it is for sale, `releasedForSale` covers "not on
 * the market", and a delete would orphan the audit trail and any lead
 * linked to it. Typos in a unit number are fixed by editing it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role, UnitStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { parseCsv } from "@/lib/csv";
import { projectUnitSchema, unitStatusPatchSchema } from "@/lib/validations";

export type UnitActionResult = { ok: true } | { ok: false; error: string };

/**
 * What a status change means for the three reservation columns.
 *
 * AVAILABLE — the hold is over; nobody is waiting on this plot, so all
 * three are cleared.
 *
 * SOLD — the lead link is kept, because it records who bought it and is
 * the only trace of that on the unit; the expiry date goes, since there is
 * no longer a reservation for it to be the deadline of.
 *
 * RESERVED — left untouched. Reservations are created from the lead's side
 * (the Lead Detail page's unit picker), which is where the lead to attach
 * is actually known; setting the status here without one is a legitimate
 * "held, paperwork to follow" state.
 */
type ReservationPatch = {
  reservedByLeadId?: null;
  reservedById?: null;
  reservationExpiresAt?: null;
};

/*
  Typed as plain nulls rather than one of Prisma's generated input types:
  the same patch is spread into create, update and updateMany calls, and
  those three take three different (and mutually unassignable) shapes. A
  field only ever gets cleared here, never set, so nulls satisfy all of
  them.
*/
function reservationPatchFor(status: UnitStatus): ReservationPatch {
  if (status === UnitStatus.AVAILABLE) {
    return { reservedByLeadId: null, reservedById: null, reservationExpiresAt: null };
  }
  if (status === UnitStatus.SOLD) {
    return { reservationExpiresAt: null };
  }
  return {};
}

/** Refresh every surface that shows this project's units. */
function revalidateUnits(locale: string, projectId: string, projectSlug: string) {
  revalidatePath(`/${locale}/admin/projects/${projectId}/units`);
  revalidatePath(`/${locale}/admin/projects/${projectId}/site-plan`);
  revalidatePath(`/${locale}/admin/m/units`);
  // A reservation change is visible on the lead it belongs to.
  revalidatePath(`/${locale}/admin/leads`);
  for (const target of locales) {
    revalidatePath(`/${target}/projects/${projectSlug}`);
  }
}

export type UnitStatusFormState = { ok: boolean; message?: string };

/**
 * Inline status dropdown on the units table (UnitStatusSelect.tsx), as a
 * <form action>. Kept in its useFormState shape because that component is
 * also used by the older per-type list.
 */
export async function updateUnitStatus(
  locale: string,
  projectId: string,
  projectSlug: string,
  unitId: string,
  _previous: UnitStatusFormState,
  formData: FormData,
): Promise<UnitStatusFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = unitStatusPatchSchema.safeParse({ status: formData.get("status") });
  if (!parsed.success) return { ok: false, message: "SAVE_FAILED" };

  try {
    // updateMany, not update — see the identical reasoning in
    // ../site-plan/actions.ts's saveUnitShape.
    const result = await prisma.projectUnit.updateMany({
      where: { id: unitId, projectId },
      data: { status: parsed.data.status, ...reservationPatchFor(parsed.data.status) },
    });
    if (result.count === 0) return { ok: false, message: "SAVE_FAILED" };
  } catch (error) {
    console.error("[updateUnitStatus]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateUnits(locale, projectId, projectSlug);

  return { ok: true, message: "SAVED" };
}

/**
 * Mobile "change status on site" bottom sheet (/admin/m/units) — same
 * write as updateUnitStatus above, but gated at Role.SALES rather than
 * EDITOR, and a plain async-function signature (no useFormState/FormData)
 * since the caller is a client component driving useTransition, not a
 * <form action>. A rep standing in front of a unit is exactly who needs
 * to flip Available → Reserved → Sold without waiting to get back to a
 * desk with EDITOR access.
 */
export type MobileUnitStatusResult = UnitActionResult;

export async function updateUnitStatusMobile(
  locale: string,
  projectId: string,
  projectSlug: string,
  unitId: string,
  status: string,
): Promise<MobileUnitStatusResult> {
  await requireAdminAction(Role.SALES);

  const parsed = unitStatusPatchSchema.safeParse({ status });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  try {
    const result = await prisma.projectUnit.updateMany({
      where: { id: unitId, projectId },
      data: { status: parsed.data.status, ...reservationPatchFor(parsed.data.status) },
    });
    if (result.count === 0) return { ok: false, error: "SAVE_FAILED" };
  } catch (error) {
    console.error("[updateUnitStatusMobile]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidateUnits(locale, projectId, projectSlug);

  return { ok: true };
}

/**
 * The site plan's own status buttons — "mark as sold", "release the
 * hold" — driven by useTransition rather than a form, and available to
 * SALES for the same reason the mobile sheet is: this is the desk version
 * of the same decision.
 */
export async function setUnitStatus(
  locale: string,
  projectId: string,
  projectSlug: string,
  unitId: string,
  status: string,
): Promise<UnitActionResult> {
  return updateUnitStatusMobile(locale, projectId, projectSlug, unitId, status);
}

const extendSchema = z.object({
  unitId: z.string().min(1),
  expiresAt: z.string().trim().max(32),
});

/**
 * "ต่ออายุการจอง" — push a reservation's follow-up date out.
 *
 * Only meaningful on a RESERVED unit, and refused otherwise: an expiry on
 * an available plot would be a deadline for nothing, and on a sold one it
 * would suggest the sale might lapse.
 *
 * As everywhere else in this app, the date is a reminder rather than a
 * timer — nothing releases the unit when it passes. See the field comment
 * on ProjectUnit.reservationExpiresAt.
 */
export async function extendReservation(
  locale: string,
  projectId: string,
  projectSlug: string,
  unitId: string,
  expiresAt: string,
): Promise<UnitActionResult> {
  await requireAdminAction(Role.SALES);

  const parsed = extendSchema.safeParse({ unitId, expiresAt });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  const date = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (date && Number.isNaN(date.getTime())) return { ok: false, error: "INVALID_INPUT" };

  const unit = await prisma.projectUnit.findFirst({
    where: { id: parsed.data.unitId, projectId },
    select: { status: true },
  });
  if (!unit) return { ok: false, error: "NOT_FOUND" };
  if (unit.status !== UnitStatus.RESERVED) return { ok: false, error: "NOT_RESERVED" };

  try {
    await prisma.projectUnit.update({
      where: { id: parsed.data.unitId },
      data: { reservationExpiresAt: date },
    });
  } catch (error) {
    console.error("[extendReservation]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidateUnits(locale, projectId, projectSlug);

  return { ok: true };
}

export type UnitFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

/**
 * Create a plot, or save an edit to one. `unitId` empty means create.
 *
 * The (projectId, unitNumber) unique constraint is what stops two plots
 * claiming the same number, and its violation is reported as a field
 * error rather than a failed save — "V-07 already exists" is something
 * the person can fix, unlike a generic failure.
 */
export async function saveUnit(
  locale: string,
  projectId: string,
  projectSlug: string,
  unitId: string,
  _previous: UnitFormState,
  formData: FormData,
): Promise<UnitFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = projectUnitSchema.safeParse({
    projectId,
    unitTypeId: (formData.get("unitTypeId") as string | null) ?? "",
    unitNumber: (formData.get("unitNumber") as string | null) ?? "",
    status: (formData.get("status") as string | null) ?? "AVAILABLE",
    landAreaSqm: (formData.get("landAreaSqm") as string | null) ?? "",
    adminNotes: (formData.get("adminNotes") as string | null) ?? "",
    sortOrder: (formData.get("sortOrder") as string | null) || "0",
    facing: (formData.get("facing") as string | null) ?? "",
    viewLabel: (formData.get("viewLabel") as string | null) ?? "",
    priceTHB: (formData.get("priceTHB") as string | null) ?? "",
    phase: (formData.get("phase") as string | null) ?? "",
    // An unticked checkbox is absent from FormData entirely.
    releasedForSale: formData.get("releasedForSale") === "on",
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
    }
    return { ok: false, message: "VALIDATION_FAILED", fields };
  }

  const { projectId: _ignored, ...values } = parsed.data;

  const data = {
    ...values,
    unitTypeId: values.unitTypeId || null,
    ...reservationPatchFor(values.status),
  };

  try {
    if (unitId) {
      const result = await prisma.projectUnit.updateMany({
        where: { id: unitId, projectId },
        data,
      });
      if (result.count === 0) return { ok: false, message: "SAVE_FAILED" };
    } else {
      await prisma.projectUnit.create({ data: { ...data, projectId } });
    }
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return {
        ok: false,
        message: "VALIDATION_FAILED",
        fields: { unitNumber: "DUPLICATE" },
      };
    }
    console.error("[saveUnit]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidateUnits(locale, projectId, projectSlug);

  return { ok: true, message: "SAVED" };
}

// ── CSV import ──────────────────────────────────────────────────────────

/**
 * Column headers the importer understands, lowercased. Anything else in
 * the file is ignored rather than rejected: a sheet exported from the
 * sales team's own workbook will carry columns this app has no field for,
 * and refusing the whole file over an extra "notes for Khun A" column
 * would make the feature unusable for the files it exists to read.
 */
const CSV_COLUMNS = [
  "unit_number",
  "unit_type",
  "status",
  "land_area_sqm",
  "facing",
  "view",
  "phase",
  "released_for_sale",
  "price_thb",
  "admin_notes",
] as const;

export type CsvImportResult =
  | {
      ok: true;
      created: number;
      updated: number;
      /** Rows the importer refused, with the reason and the line number as
       *  the person sees it in their spreadsheet (header = line 1). */
      skipped: { line: number; unitNumber: string; reason: string }[];
    }
  | { ok: false; error: string };

/** Guard against a paste of something that is not a unit list at all. */
const MAX_CSV_ROWS = 2_000;

function normaliseStatus(value: string): UnitStatus | null {
  const upper = value.trim().toUpperCase().replace(/\s+/g, "_");
  return (Object.values(UnitStatus) as string[]).includes(upper) ? (upper as UnitStatus) : null;
}

function normaliseBoolean(value: string): boolean | null {
  const text = value.trim().toLowerCase();
  if (["true", "yes", "y", "1"].includes(text)) return true;
  if (["false", "no", "n", "0"].includes(text)) return false;
  return null;
}

/**
 * "นำเข้า CSV" — upsert plots from a spreadsheet, matched on unit number.
 *
 * Upsert rather than replace: the file a sales office keeps is usually a
 * partial list (this month's release, or the plots whose status changed),
 * and a replace would delete every plot missing from it. Nothing is ever
 * deleted here; a row that names an existing unit updates the columns it
 * carries and leaves the rest alone.
 *
 * Every row is validated before anything is written, and the whole import
 * runs in one transaction: a file with a typo in row 40 reports the typo
 * and changes nothing, rather than leaving 39 rows applied and the person
 * guessing where it stopped.
 */
export async function importUnitsCsv(
  locale: string,
  projectId: string,
  projectSlug: string,
  csvText: string,
): Promise<CsvImportResult> {
  await requireAdminAction(Role.EDITOR);

  if (!csvText.trim()) return { ok: false, error: "EMPTY_FILE" };

  const rows = parseCsv(csvText);
  if (rows.length < 2) return { ok: false, error: "NO_ROWS" };
  if (rows.length > MAX_CSV_ROWS + 1) return { ok: false, error: "TOO_MANY_ROWS" };

  const header = rows[0].map((cell) => cell.trim().toLowerCase().replace(/\s+/g, "_"));
  const index = (column: (typeof CSV_COLUMNS)[number]) => header.indexOf(column);

  if (index("unit_number") === -1) return { ok: false, error: "MISSING_UNIT_NUMBER_COLUMN" };

  const [existingUnits, unitTypes] = await Promise.all([
    prisma.projectUnit.findMany({ where: { projectId }, select: { id: true, unitNumber: true } }),
    prisma.projectUnitType.findMany({ where: { projectId }, select: { id: true, name: true } }),
  ]);

  const existingByNumber = new Map(existingUnits.map((unit) => [unit.unitNumber.toLowerCase(), unit.id]));
  const typeByName = new Map(unitTypes.map((type) => [type.name.trim().toLowerCase(), type.id]));

  const skipped: { line: number; unitNumber: string; reason: string }[] = [];
  const creates: Prisma.ProjectUnitCreateManyInput[] = [];
  const updates: { id: string; data: Prisma.ProjectUnitUpdateInput }[] = [];
  const seen = new Set<string>();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const line = rowIndex + 1;
    const cell = (column: (typeof CSV_COLUMNS)[number]) => {
      const at = index(column);
      return at === -1 ? "" : (row[at] ?? "").trim();
    };

    const unitNumber = cell("unit_number");
    if (!unitNumber) {
      // A trailing blank line is not an error worth reporting.
      if (row.every((value) => value.trim() === "")) continue;
      skipped.push({ line, unitNumber: "", reason: "MISSING_UNIT_NUMBER" });
      continue;
    }

    const key = unitNumber.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ line, unitNumber, reason: "DUPLICATE_IN_FILE" });
      continue;
    }
    seen.add(key);

    const data: Prisma.ProjectUnitUpdateInput = {};
    let rowError: string | null = null;

    const statusText = cell("status");
    if (statusText) {
      const status = normaliseStatus(statusText);
      if (!status) rowError ??= "BAD_STATUS";
      else Object.assign(data, { status, ...reservationPatchFor(status) });
    }

    const typeName = cell("unit_type");
    if (typeName) {
      const typeId = typeByName.get(typeName.toLowerCase());
      if (!typeId) rowError ??= "UNKNOWN_UNIT_TYPE";
      else data.unitType = { connect: { id: typeId } };
    }

    const landArea = cell("land_area_sqm");
    if (landArea) {
      const value = Number(landArea);
      if (!Number.isFinite(value) || value < 0) rowError ??= "BAD_LAND_AREA";
      else data.landAreaSqm = value;
    }

    const price = cell("price_thb");
    if (price) {
      const value = Number(price.replace(/,/g, ""));
      if (!Number.isFinite(value) || value < 0) rowError ??= "BAD_PRICE";
      else data.priceTHB = value;
    }

    const phase = cell("phase");
    if (phase) {
      const value = Number(phase);
      if (!Number.isInteger(value) || value < 1 || value > 99) rowError ??= "BAD_PHASE";
      else data.phase = value;
    }

    const released = cell("released_for_sale");
    if (released) {
      const value = normaliseBoolean(released);
      if (value === null) rowError ??= "BAD_RELEASED";
      else data.releasedForSale = value;
    }

    if (cell("facing")) data.facing = cell("facing").slice(0, 60);
    if (cell("view")) data.viewLabel = cell("view").slice(0, 60);
    if (cell("admin_notes")) data.adminNotes = cell("admin_notes").slice(0, 2000);

    if (rowError) {
      skipped.push({ line, unitNumber, reason: rowError });
      continue;
    }

    const existingId = existingByNumber.get(key);
    if (existingId) {
      updates.push({ id: existingId, data });
    } else {
      creates.push({
        projectId,
        unitNumber,
        status: (data.status as UnitStatus | undefined) ?? UnitStatus.AVAILABLE,
        unitTypeId: typeName ? (typeByName.get(typeName.toLowerCase()) ?? null) : null,
        landAreaSqm: (data.landAreaSqm as number | undefined) ?? null,
        priceTHB: (data.priceTHB as number | undefined) ?? null,
        phase: (data.phase as number | undefined) ?? null,
        releasedForSale: (data.releasedForSale as boolean | undefined) ?? true,
        facing: (data.facing as string | undefined) ?? null,
        viewLabel: (data.viewLabel as string | undefined) ?? null,
        adminNotes: (data.adminNotes as string | undefined) ?? null,
      });
    }
  }

  // Nothing applies if any row failed — see the doc comment above.
  if (skipped.length > 0) {
    return { ok: true, created: 0, updated: 0, skipped };
  }

  try {
    await prisma.$transaction([
      ...updates.map(({ id, data }) => prisma.projectUnit.update({ where: { id }, data })),
      ...(creates.length ? [prisma.projectUnit.createMany({ data: creates })] : []),
    ]);
  } catch (error) {
    console.error("[importUnitsCsv]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidateUnits(locale, projectId, projectSlug);

  return { ok: true, created: creates.length, updated: updates.length, skipped: [] };
}
