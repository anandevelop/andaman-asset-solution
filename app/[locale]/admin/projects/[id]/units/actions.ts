"use server";

/**
 * app/[locale]/admin/projects/[id]/units/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Status-only update for one unit — the inline dropdown on the units
 * list (components/admin/UnitStatusSelect.tsx). Full unit creation/
 * editing (land area, price, admin notes) is out of scope for this
 * phase; units come from prisma/seed.ts's Sale Kit import, and the two
 * things an admin actually changes day to day are status (here) and
 * shapePoints (../site-plan/actions.ts).
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { unitStatusPatchSchema } from "@/lib/validations";

export type UnitStatusFormState = { ok: boolean; message?: string };

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
      data: { status: parsed.data.status },
    });
    if (result.count === 0) return { ok: false, message: "SAVE_FAILED" };
  } catch (error) {
    console.error("[updateUnitStatus]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/projects/${projectId}/units`);
  revalidatePath(`/${locale}/admin/projects/${projectId}/site-plan`);
  for (const target of locales) {
    revalidatePath(`/${target}/projects/${projectSlug}`);
  }

  return { ok: true, message: "SAVED" };
}
