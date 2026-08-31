"use server";

/**
 * app/[locale]/admin/progress/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Monthly construction updates. Images are URL references, not uploads —
 * the site already serves imagery from a CDN, so storing a URL list keeps
 * this phase free of blob storage, signed URLs and virus scanning. Swapping
 * in a real uploader later only changes how the `images` array is filled.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { projectProgressSchema, fieldErrors } from "@/lib/validations";

export type ProgressFormState = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
};

function readForm(formData: FormData, projectId: string) {
  const text = (key: string) => (formData.get(key) as string | null) ?? "";

  return {
    projectId,
    month: text("month"),
    year: text("year"),
    videoUrl: text("videoUrl"),
    images: text("images"),
    isPublished: formData.get("isPublished") === "on",
  };
}

/**
 * P2003 on the publishedBy FK: the signed-in session's user id has no
 * matching row in `users`. This happens after the database is reset or
 * reseeded (a fresh clone, `prisma migrate reset`, restoring a dump) while
 * a browser still holds a NextAuth session/JWT minted against the old
 * user id — `requireAdminAction()` trusts that id without re-checking the
 * database (see lib/admin/guard.ts), so the insert reaches Postgres before
 * anything catches the mismatch. Signing out and back in mints a session
 * against the current `users` row and the error stops recurring.
 */
function isStalePublishedBy(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003" &&
    typeof error.meta?.field_name === "string" &&
    error.meta.field_name.includes("publishedBy")
  );
}

async function revalidateProgress(locale: string, projectId: string) {
  revalidatePath(`/${locale}/admin/progress/${projectId}`);

  // The public gallery is keyed by slug, so resolve it before revalidating.
  const project = await prisma.project
    .findUnique({ where: { id: projectId }, select: { slug: true } })
    .catch(() => null);

  if (project) {
    for (const target of locales) {
      revalidatePath(`/${target}/projects/${project.slug}`);
    }
  }
}

// ── Create ──────────────────────────────────────────────────────────────

export async function createProgress(
  locale: string,
  projectId: string,
  _previous: ProgressFormState,
  formData: FormData,
): Promise<ProgressFormState> {
  const user = await requireAdminAction();

  const parsed = projectProgressSchema.safeParse(readForm(formData, projectId));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { projectId: _pid, ...data } = parsed.data;

  try {
    await prisma.projectProgress.create({
      data: { ...data, projectId, publishedBy: user.id },
    });
  } catch (error) {
    // The (projectId, year, month) unique key is the guardrail against two
    // editors both adding "August" from different tabs.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE_MONTH" };
    }
    if (isStalePublishedBy(error)) {
      return { ok: false, message: "STALE_SESSION" };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  await revalidateProgress(locale, projectId);
  return { ok: true, message: "SAVED" };
}

// ── Update ──────────────────────────────────────────────────────────────

export async function updateProgress(
  locale: string,
  projectId: string,
  id: string,
  _previous: ProgressFormState,
  formData: FormData,
): Promise<ProgressFormState> {
  const user = await requireAdminAction();

  const parsed = projectProgressSchema.safeParse(readForm(formData, projectId));
  if (!parsed.success) return { ok: false, fields: fieldErrors(parsed.error) };

  const { projectId: _pid, ...data } = parsed.data;

  try {
    await prisma.projectProgress.update({
      where: { id },
      data: { ...data, publishedBy: user.id },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { ok: false, message: "DUPLICATE_MONTH" };
    }
    if (isStalePublishedBy(error)) {
      return { ok: false, message: "STALE_SESSION" };
    }
    return { ok: false, message: "SAVE_FAILED" };
  }

  await revalidateProgress(locale, projectId);
  return { ok: true, message: "SAVED" };
}

// ── Delete ──────────────────────────────────────────────────────────────

/** Hard delete: a progress entry is a photo caption, not a record of
 *  record. Nothing else references it. */
export async function deleteProgress(
  locale: string,
  projectId: string,
  id: string,
): Promise<void> {
  await requireAdminAction();

  await prisma.projectProgress.delete({ where: { id } });
  await revalidateProgress(locale, projectId);
}
