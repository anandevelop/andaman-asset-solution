"use server";

/**
 * app/[locale]/admin/projects/[id]/seo/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Saving one project's search settings.
 *
 * Split by scope, because the two halves live in different tables and have
 * different blast radii: the per-language copy is a ProjectTranslation row
 * and only affects that language, while the share image, canonical and
 * sitemap hints sit on the project and affect every language at once.
 *
 * Same honesty as the content editor next door: on a published project
 * these are live settings, and switching indexing off or pointing the
 * canonical elsewhere takes effect as soon as the page revalidates.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { locales } from "@/i18n";

export type SeoSaveResult = { ok: true } | { ok: false; error: string };

const localeSeoSchema = z.object({
  projectId: z.string().min(1),
  locale: z.enum(locales),
  metaTitle: z.string().trim().max(300),
  metaDescription: z.string().trim().max(600),
  noIndex: z.boolean(),
  // Short list a person types, not an import.
  targetKeywords: z.array(z.string().trim().min(1).max(80)).max(20),
});

export async function saveLocaleSeo(adminLocale: string, input: unknown): Promise<SeoSaveResult> {
  await requireAdminAction(Role.EDITOR);

  const parsed = localeSeoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  const { projectId, locale, metaTitle, metaDescription, noIndex, targetKeywords } = parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: {
      slug: true,
      nameEn: true,
      translations: { where: { locale }, select: { name: true } },
    },
  });
  if (!project) return { ok: false, error: "NOT_FOUND" };

  const blankToNull = (value: string) => (value.length === 0 ? null : value);
  const keywords = [...new Set(targetKeywords)];

  try {
    await prisma.projectTranslation.upsert({
      where: { projectId_locale: { projectId, locale } },
      update: {
        metaTitle: blankToNull(metaTitle),
        metaDescription: blankToNull(metaDescription),
        noIndex,
        targetKeywords: keywords,
      },
      create: {
        projectId,
        locale,
        /*
          `name` is required and is what every other part of the app reads
          as "this language exists" (see ProjectTranslation in
          schema.prisma). Saving SEO copy for a language nobody has
          written yet would otherwise create a row that makes the language
          look present while its page is empty — so it borrows the
          project's own name until someone writes a real one.
        */
        name: project.translations[0]?.name ?? project.nameEn,
        metaTitle: blankToNull(metaTitle),
        metaDescription: blankToNull(metaDescription),
        noIndex,
        targetKeywords: keywords,
      },
    });
  } catch (error) {
    console.error("[saveLocaleSeo]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidatePath(`/${adminLocale}/admin/projects/${projectId}/seo`);
  revalidatePath(`/${locale}/projects/${project.slug}`);

  return { ok: true };
}

const projectSeoSchema = z.object({
  projectId: z.string().min(1),
  ogImageUrl: z.string().trim().max(1000),
  canonicalUrl: z.string().trim().max(1000),
  sitemapPriority: z.number().min(0).max(1).nullable(),
  sitemapChangeFreq: z.string().trim().max(20),
});

export async function saveProjectSeo(adminLocale: string, input: unknown): Promise<SeoSaveResult> {
  await requireAdminAction(Role.EDITOR);

  const parsed = projectSeoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  const { projectId, ogImageUrl, canonicalUrl, sitemapPriority, sitemapChangeFreq } = parsed.data;

  // A canonical that is not an absolute URL is worse than none: it tells
  // Google this page is a duplicate of something it cannot resolve.
  if (canonicalUrl.length > 0 && !/^https?:\/\//.test(canonicalUrl)) {
    return { ok: false, error: "CANONICAL_NOT_ABSOLUTE" };
  }

  try {
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ogImageUrl: ogImageUrl || null,
        canonicalUrl: canonicalUrl || null,
        sitemapPriority,
        sitemapChangeFreq: sitemapChangeFreq || null,
      },
      select: { slug: true },
    });

    revalidatePath(`/${adminLocale}/admin/projects/${projectId}/seo`);
    revalidatePath("/sitemap.xml");
    for (const target of locales) revalidatePath(`/${target}/projects/${project.slug}`);
  } catch (error) {
    console.error("[saveProjectSeo]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  return { ok: true };
}
