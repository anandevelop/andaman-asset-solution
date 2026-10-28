"use server";

/**
 * app/[locale]/admin/(catalog)/projects/nearby/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Saving a "Nearby" list: a project's own (projectId) or the shared one
 * (null). See lib/nearby.ts for how a page picks between them.
 *
 * The editor posts the whole list as JSON and it is replaced in one
 * transaction, not patched row by row. A list of a few tabs with a few
 * places each is one document to the person editing it: they reorder,
 * rename and delete in one sitting and press Save once. A per-row action
 * would need ids threaded through a client-side reorder, and could leave
 * half a reorder saved if one request failed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { nearbyListSchema } from "@/lib/validations";
import { revalidatePublicSite } from "@/lib/revalidate-site";

export type NearbyFormState = {
  ok: boolean;
  message?: "SAVED" | "SAVE_FAILED" | "INVALID" | "NOT_FOUND";
  /** First problem found, as "path: message", for the editor to show. */
  detail?: string;
};

async function projectExists(projectId: string) {
  return Boolean(await prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } }));
}

function revalidate(locale: string, projectId: string | null) {
  revalidatePublicSite();
  revalidatePath(`/${locale}/admin/projects/nearby`);
  if (projectId) revalidatePath(`/${locale}/admin/projects/${projectId}/nearby`);
}

export async function saveNearbyList(
  locale: string,
  projectId: string | null,
  _previous: NearbyFormState,
  formData: FormData,
): Promise<NearbyFormState> {
  await requireAdminAction(Role.EDITOR);
  if (projectId && !(await projectExists(projectId))) return { ok: false, message: "NOT_FOUND" };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? "[]"));
  } catch {
    return { ok: false, message: "INVALID" };
  }
  const parsed = nearbyListSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: "INVALID", detail: `${issue.path.join(".")}: ${issue.message}` };
  }

  try {
    await prisma.$transaction([
      prisma.nearbyCategory.deleteMany({ where: { projectId } }),
      ...parsed.data.map((category, sortOrder) =>
        prisma.nearbyCategory.create({
          data: {
            projectId,
            labelEn: category.labels.en,
            labelTh: category.labels.th,
            labelZh: category.labels.zh,
            labelRu: category.labels.ru,
            sortOrder,
            places: {
              create: category.places.map((place, index) => ({
                name: place.name,
                nameTh: place.names.th,
                nameZh: place.names.zh,
                nameRu: place.names.ru,
                distanceKm: place.distanceKm,
                durationMin: place.durationMin,
                latitude: place.pin?.lat ?? null,
                longitude: place.pin?.lng ?? null,
                sortOrder: index,
              })),
            },
          },
        }),
      ),
    ]);
  } catch (error) {
    console.error("[saveNearbyList]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }

  revalidate(locale, projectId);
  return { ok: true, message: "SAVED" };
}

/** Drop a project's own list, so it shows the shared one again. */
export async function revertToSharedNearbyList(locale: string, projectId: string): Promise<NearbyFormState> {
  await requireAdminAction(Role.EDITOR);
  try {
    await prisma.nearbyCategory.deleteMany({ where: { projectId } });
  } catch (error) {
    console.error("[revertToSharedNearbyList]", error);
    return { ok: false, message: "SAVE_FAILED" };
  }
  revalidate(locale, projectId);
  return { ok: true, message: "SAVED" };
}
