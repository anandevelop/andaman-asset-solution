"use server";

/**
 * app/[locale]/admin/projects/[id]/content/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Saving one language's copy from the 4-language content editor.
 *
 * WHAT "SAVE" ACTUALLY DOES, AND WHY THE EDITOR SAYS SO.
 *
 * ProjectTranslation rows *are* the live content — the public project page
 * reads them directly (lib/projects.ts's getProjectBySlug). The
 * draft→review→publish workflow gates `isPublished` and nothing else (see
 * lib/publishing-gate.ts, whose own comment is explicit that "the row's
 * other edited fields still save normally"). So on a project that is
 * already published, saving here changes what visitors see as soon as the
 * page revalidates.
 *
 * That is why this action returns `wentLive`, and why the editor labels
 * the button accordingly instead of calling it "save draft" — which would
 * be true for an unpublished project and a lie for a live one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { requireAdminAction } from "@/lib/admin/guard";
// Field list and limits live in lib/, not here: a "use server" module may
// export only async functions. See lib/project-content.ts.

const saveSchema = z.object({
  projectId: z.string().min(1),
  locale: z.enum(locales),
  values: z.object({
    // `name` anchors "this locale exists" everywhere else in the app (see
    // ProjectTranslation's schema comment), so it is the one field that
    // cannot be blanked out from here.
    name: z.string().trim().min(1).max(300),
    tagline: z.string().trim().max(500),
    description: z.string().trim().max(8000),
    conceptDesign: z.string().trim().max(20000),
    aboutThisProject: z.string().trim().max(20000),
    metaTitle: z.string().trim().max(300),
    metaDescription: z.string().trim().max(600),
  }),
});

export type SaveContentResult =
  | { ok: true; wentLive: boolean; savedAt: string }
  | { ok: false; error: string };

export async function saveProjectContent(
  adminLocale: string,
  input: unknown,
): Promise<SaveContentResult> {
  await requireAdminAction(Role.EDITOR);

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  const { projectId, locale, values } = parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { slug: true, isPublished: true },
  });
  if (!project) return { ok: false, error: "NOT_FOUND" };

  // Empty string → null, so "not translated yet" is one state in the
  // database rather than two that read differently everywhere else.
  const blankToNull = (value: string) => (value.trim().length === 0 ? null : value.trim());

  const data = {
    name: values.name.trim(),
    tagline: blankToNull(values.tagline),
    description: blankToNull(values.description),
    conceptDesign: blankToNull(values.conceptDesign),
    aboutThisProject: blankToNull(values.aboutThisProject),
    metaTitle: blankToNull(values.metaTitle),
    metaDescription: blankToNull(values.metaDescription),
  };

  try {
    await prisma.projectTranslation.upsert({
      where: { projectId_locale: { projectId, locale } },
      update: data,
      create: { projectId, locale, ...data },
    });
  } catch (error) {
    console.error("[saveProjectContent]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidatePath(`/${adminLocale}/admin/projects/${projectId}/content`);
  revalidatePath(`/${adminLocale}/admin/publishing`);
  // The public page for the locale that was edited, so the preview beside
  // the editor shows the save rather than a cached copy of the old copy.
  revalidatePath(`/${locale}/projects/${project.slug}`);
  revalidatePath(`/${locale}/projects`);

  return { ok: true, wentLive: project.isPublished, savedAt: new Date().toISOString() };
}
