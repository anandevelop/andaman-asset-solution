"use server";

/**
 * app/[locale]/admin/projects/[id]/site-plan/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Saves one unit's traced polygon from the drawing tool
 * (components/admin/SitePlanDrawer.tsx). There is deliberately no
 * separate "update centroid" step for the admin to trigger — the whole
 * point of shapePoints being structured {x,y} data rather than an SVG
 * string is that the centroid can be derived here, every time, so
 * positionXPercent/Y can never drift out of sync with the shape that
 * produced them.
 *
 * sandbox: `prisma as any` — shapePoints/positionXPercent/Y were added to
 * ProjectUnit in this phase; see the cast note above getProjectBySlug in
 * lib/projects.ts for why the locally generated client doesn't type them
 * yet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { unitShapeSchema, fieldErrors } from "@/lib/validations";

export type UnitShapeFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

export async function saveUnitShape(
  locale: string,
  projectId: string,
  projectSlug: string,
  _previous: UnitShapeFormState,
  formData: FormData,
): Promise<UnitShapeFormState> {
  await requireAdminAction(Role.EDITOR);

  const parsed = unitShapeSchema.safeParse({
    unitId: (formData.get("unitId") as string | null) ?? "",
    shapePoints: (formData.get("shapePoints") as string | null) ?? "",
  });
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { unitId, shapePoints } = parsed.data;

  // Centroid of the polygon vertices — a plain average, not an
  // area-weighted centroid. Close enough for label placement on a
  // roughly-convex plot outline, and area-weighting would need the
  // shoelace formula for no visible benefit here.
  const positionXPercent =
    shapePoints.reduce((sum, p) => sum + p.x, 0) / shapePoints.length;
  const positionYPercent =
    shapePoints.reduce((sum, p) => sum + p.y, 0) / shapePoints.length;

  try {
    // updateMany rather than update: `where` needs to check both id and
    // projectId together (a unit id from a different project should
    // never be writable through this action), and Prisma's `update`
    // only accepts its generated unique-where shape — id alone, or the
    // projectId_unitNumber compound — not an arbitrary combination.
    const result = await (prisma as any).projectUnit.updateMany({
      where: { id: unitId, projectId },
      data: { shapePoints, positionXPercent, positionYPercent },
    });
    if (result.count === 0) {
      return { ok: false, message: "SAVE_FAILED" };
    }
  } catch (error) {
    console.error("[saveUnitShape]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/projects/${projectId}/site-plan`);
  revalidatePath(`/${locale}/admin/projects/${projectId}/units`);
  for (const target of locales) {
    revalidatePath(`/${target}/projects/${projectSlug}`);
  }

  return { ok: true, message: "SAVED" };
}
