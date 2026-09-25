/**
 * app/[locale]/admin/projects/[id]/content/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "เนื้อหา 4 ภาษา" (Content.dc.html) — one project's translated copy, the
 * source language beside the one being written.
 *
 * Split out from ProjectForm rather than folded into it. That form edits
 * one language at a time because every field on it is uncontrolled (see
 * its header, and lib/admin/translated-form.ts); this screen needs two
 * languages on screen at once and a live preview, which is a different
 * shape of editor, not a variation on that one. The overview tab still
 * owns everything that is not translated — location, price, images.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { siteConfig } from "@/config/site";
import { locales, LOCALE_DISPLAY_ORDER, type Locale } from "@/i18n";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import ProjectContentEditor, {
  type ContentValues,
  type LanguageTab,
} from "@/components/admin/ProjectContentEditor";
import { CONTENT_FIELDS } from "@/lib/project-content";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ lang?: string }>;
};

/**
 * The language everything else is translated *from*.
 *
 * Thai: this is a Phuket developer whose Sale Kits, price lists and
 * marketing copy are written in Thai first, and the admin's own
 * LOCALE_DISPLAY_ORDER already puts it first for the same reason.
 */
const SOURCE_LOCALE: Locale = "th";

const LOCALE_LABELS: Record<Locale, string> = {
  th: "ไทย",
  en: "English",
  zh: "中文",
  ru: "Русский",
};

function valuesFrom(row: Record<string, unknown> | undefined): ContentValues {
  return Object.fromEntries(
    CONTENT_FIELDS.map((field) => [field, ((row?.[field] as string | null) ?? "").toString()]),
  ) as ContentValues;
}

/**
 * How much of the source language's copy exists in another one.
 *
 * Measured against the source rather than against all seven fields: a
 * project whose Thai copy leaves "About this project" empty should not
 * show every other language stuck at 86%, because there is nothing there
 * to translate.
 */
function percentOf(source: ContentValues, target: ContentValues): number {
  const expected = CONTENT_FIELDS.filter((field) => source[field].trim().length > 0);
  if (expected.length === 0) return 100;

  const done = expected.filter((field) => target[field].trim().length > 0).length;
  return Math.round((done / expected.length) * 100);
}

export default async function AdminProjectContentPage(props: Props) {
  const [{ locale, id: projectId }, searchParams] = await Promise.all([
    props.params,
    props.searchParams,
  ]);

  // VIEWER may open this to read a project's translated copy; saving
  // stays behind a disabled fieldset for anyone below EDITOR.
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });

  const project = await safeQuery(
    "admin:project:content",
    () =>
      prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameTh: true,
          isPublished: true,
          translations: true,
        },
      }),
    undefined,
  );

  if (!project) notFound();

  const rows = project.translations as unknown as Record<string, unknown>[];
  const byLocale = new Map(rows.map((row) => [row.locale as string, row]));

  const sourceValues = valuesFrom(byLocale.get(SOURCE_LOCALE));

  // The language being written. Defaults to the first one that is not the
  // source, since editing the source against itself shows nothing useful.
  const requested = searchParams.lang as Locale | undefined;
  const target: Locale =
    requested && (locales as readonly string[]).includes(requested) && requested !== SOURCE_LOCALE
      ? requested
      : "en";

  const languages: LanguageTab[] = LOCALE_DISPLAY_ORDER.map((code) => ({
    locale: code,
    label: LOCALE_LABELS[code],
    percent: code === SOURCE_LOCALE ? 100 : percentOf(sourceValues, valuesFrom(byLocale.get(code))),
    isSource: code === SOURCE_LOCALE,
  }));

  const projectName = locale === "th" ? project.nameTh : project.nameEn;

  return (
    <div className="space-y-6">
      <header>
        <Link
          href={`/${locale}/admin/projects`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("projects.title")}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-2.5">
          <h1 className="text-2xl font-semibold text-primary sm:text-3xl">{projectName}</h1>
          <span
            className={
              project.isPublished
                ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
            }
          >
            {project.isPublished ? t("common.published") : t("common.draft")}
          </span>
        </div>
      </header>

      <ProjectHubTabs
        locale={locale}
        projectId={project.id}
        active="content"
      />

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <fieldset disabled={!canWrite} className="contents">
      <ProjectContentEditor
        adminLocale={locale}
        projectId={project.id}
        projectSlug={project.slug}
        target={target}
        source={LOCALE_LABELS[SOURCE_LOCALE]}
        sourceValues={sourceValues}
        targetValues={valuesFrom(byLocale.get(target))}
        languages={languages}
        siteOrigin={siteConfig.url}
        isPublished={project.isPublished}
        labels={{
          sectionTitle: t("projectContent.sectionTitle"),
          sourceNote: t("projectContent.sourceNote"),
          targetNote: t("projectContent.targetNote"),
          compareWith: t("projectContent.compareWith"),
          fields: {
            name: t("projects.name"),
            tagline: t("projects.tagline"),
            description: t("projects.description"),
            conceptDesign: t("projects.conceptDesign"),
            aboutThisProject: t("projects.aboutThisProject"),
            metaTitle: t("projects.metaTitle"),
            metaDescription: t("projects.metaDescription"),
          },
          required: t("projectContent.required"),
          untranslated: t("projectContent.untranslated"),
          copyFromSource: t("projectContent.copyFromSource"),
          copyAllFromSource: t("projectContent.copyAllFromSource"),
          unsavedHint: t("projectContent.unsavedHint"),
          discard: t("projectContent.discard"),
          save: t("projectContent.save"),
          saveGoesLive: t("projectContent.saveGoesLive"),
          saving: t("common.saving"),
          savedJustNow: t("projectContent.savedJustNow"),
          restoredNotice: t("projectContent.restoredNotice"),
          previewTitle: t("projectContent.previewTitle"),
          previewDesktop: t("projectContent.previewDesktop"),
          previewMobile: t("projectContent.previewMobile"),
          previewUnpublished: t("projectContent.previewUnpublished"),
          previewNote: t("projectContent.previewNote"),
          error: t("common.error"),
          confirmDiscard: t("projectContent.confirmDiscard"),
        }}
      />
      </fieldset>
    </div>
  );
}
