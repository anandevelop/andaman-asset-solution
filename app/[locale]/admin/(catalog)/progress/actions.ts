"use server";

/**
 * app/[locale]/admin/(catalog)/progress/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Monthly construction updates. Images are URL references, not uploads —
 * the site already serves imagery from a CDN, so storing a URL list keeps
 * this phase free of blob storage, signed URLs and virus scanning. Swapping
 * in a real uploader later only changes how the `images` array is filled.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
import { projectProgressSchema, progressDetailSchema, fieldErrors } from "@/lib/validations";
import { buyerEmailsFor } from "@/lib/admin/project-progress";
import { notifyBuyersOfProgress } from "@/lib/email";
import { siteConfig } from "@/config/site";

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
  revalidatePath(`/${locale}/admin/projects/${projectId}/progress`);

  // The public gallery is keyed by slug, so resolve it before revalidating.
  const project = await prisma.project
    .findUnique({ where: { id: projectId }, select: { slug: true } })
    .catch(() => null);

  for (const target of locales) {
    // /progress exists to answer "has anything new been photographed?", so
    // it is the one page a new update must not be missing from. It was
    // relying on its own 300s backstop instead.
    revalidatePath(`/${target}/progress`);
  }

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

// ── Phase timeline, and publishing a monthly update ─────────────────────

/**
 * Save one month's write-up and completion figure.
 *
 * Separate from createProgress/updateProgress above, which own the older
 * month/images/video form. This is the Progress.dc.html editor: the two
 * write to the same row, so both stay usable, but only this one knows
 * about percentages and the translated summary.
 */
export async function saveProgressDetail(
  locale: string,
  projectId: string,
  input: {
    id?: string;
    month: number;
    year: number;
    percentComplete: number | null;
    summaries: Record<string, string>;
    images: string[];
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await requireAdminAction(Role.EDITOR);

  const parsed = progressDetailSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  const { id, month, year, percentComplete, summaries, images } = parsed.data;

  try {
    const row = await prisma.projectProgress.upsert({
      where: id
        ? { id }
        : { projectId_year_month: { projectId, year, month } },
      update: { month, year, percentComplete, images, publishedBy: session.id },
      create: { projectId, month, year, percentComplete, images, publishedBy: session.id },
      select: { id: true },
    });

    // Blank means "nothing written in this language", one state rather
    // than two — same convention as the project content editor.
    for (const [code, summary] of Object.entries(summaries)) {
      const value = summary.trim();
      await prisma.projectProgressTranslation.upsert({
        where: { progressId_locale: { progressId: row.id, locale: code } },
        update: { summary: value || null },
        create: { progressId: row.id, locale: code, summary: value || null },
      });
    }

    await revalidateProgress(locale, projectId);
    return { ok: true, id: row.id };
  } catch (error) {
    console.error("[saveProgressDetail]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}

/**
 * Publish or unpublish one month's update, optionally emailing the
 * development's buyers.
 *
 * The email only goes out when the entry is being published *and* the box
 * was ticked, and it is sent after the write: a mail failure must leave a
 * published update rather than an unpublished one and a confusing error.
 * The number actually attempted comes back so the screen can report what
 * happened instead of assuming.
 */
export async function setProgressPublished(
  locale: string,
  projectId: string,
  progressId: string,
  isPublished: boolean,
  notifyBuyers = false,
): Promise<{ ok: true; notified: number } | { ok: false; error: string }> {
  await requireAdminAction(Role.EDITOR);

  let entry;
  try {
    const result = await prisma.projectProgress.updateMany({
      where: { id: progressId, projectId },
      data: { isPublished },
    });
    if (result.count === 0) return { ok: false, error: "NOT_FOUND" };

    entry = await prisma.projectProgress.findUnique({
      where: { id: progressId },
      select: {
        month: true,
        year: true,
        percentComplete: true,
        translations: { select: { locale: true, summary: true } },
        project: { select: { slug: true, nameEn: true, nameTh: true } },
      },
    });
  } catch (error) {
    console.error("[setProgressPublished]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  await revalidateProgress(locale, projectId);

  if (!isPublished || !notifyBuyers || !entry) return { ok: true, notified: 0 };

  const buyers = await buyerEmailsFor(projectId);
  const projectName = locale === "th" ? entry.project.nameTh : entry.project.nameEn;

  const notified = await notifyBuyersOfProgress({
    buyers,
    projectName,
    monthLabel: `${entry.month}/${entry.year}`,
    percentComplete: entry.percentComplete,
    summary:
      entry.translations.find((t) => t.locale === locale)?.summary ??
      entry.translations.find((t) => (t.summary ?? "").trim())?.summary ??
      null,
    url: `${siteConfig.url}/${locale}/projects/${entry.project.slug}`,
  });

  return { ok: true, notified };
}
