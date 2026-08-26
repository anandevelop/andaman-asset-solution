/**
 * app/[locale]/admin/projects/[id]/edit/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Edit form. Prisma types are flattened to strings here — the form deals in
 * FormData, and Decimal/null would otherwise leak into a client component.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CheckCircle2, ExternalLink, Grid3x3, HardHat, Image as ImageIcon, Layers } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import {
  parseEditingLocale,
  pickEditingTranslation,
  translationCompleteness,
} from "@/lib/admin/translated-form";
import { deleteProject, updateProject } from "../../actions";
import ProjectForm, { type ProjectFormValues } from "@/components/admin/ProjectForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import SaveToast from "@/components/admin/SaveToast";

type Props = {
  params: { locale: string; id: string };
  searchParams: { created?: string; lang?: string };
};

/** null / Decimal / number → the string an <input> expects. */
function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default async function EditProjectPage({ params, searchParams }: Props) {
  const { locale, id } = params;
  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });
  const lang = parseEditingLocale(searchParams.lang);

  // sandbox: as-any — conceptDesignEn/Th, aboutThisProjectEn/Th and
  // specialFeatures predate a runnable `prisma generate` here; see the
  // cast note above getProjectBySlug in lib/projects.ts.
  const project: any = await (prisma as any).project.findFirst({
    where: { id, deletedAt: null },
    include: { translations: true },
  });

  if (!project) notFound();

  const completeness = translationCompleteness<any>(project.translations, "name");
  const editing = pickEditingTranslation<any>(project.translations, lang);

  const values: ProjectFormValues = {
    slug: project.slug,
    name: editing?.name ?? "",
    tagline: editing?.tagline ?? "",
    description: editing?.description ?? "",
    conceptDesign: editing?.conceptDesign ?? "",
    conceptDesignImageUrl: str(project.conceptDesignImageUrl),
    aboutThisProject: editing?.aboutThisProject ?? "",
    aboutThisProjectImageUrl: str(project.aboutThisProjectImageUrl),
    specialFeatures: JSON.stringify(project.specialFeatures ?? []),
    location: project.location,
    propertyType: project.propertyType,
    status: project.status,
    landAreaSqm: str(project.landAreaSqm),
    projectArea: str(project.projectArea),
    totalUnits: str(project.totalUnits),
    // The textarea edits one entry per line.
    facilities: project.facilities.join("\n"),
    heroImageUrl: str(project.heroImageUrl),
    heroMediaType: project.heroMediaType,
    heroVideoUrl: str(project.heroVideoUrl),
    gallery: project.gallery.join("\n"),
    brochureUrl: str(project.brochureUrl),
    masterPlanImageUrl: str(project.masterPlanImageUrl),
    latitude: str(project.latitude),
    longitude: str(project.longitude),
    googleMapsUrl: str(project.googleMapsUrl),
    metaTitle: editing?.metaTitle ?? "",
    metaDescription: editing?.metaDescription ?? "",
    isPublished: project.isPublished,
    sortOrder: String(project.sortOrder),
  };

  const action = updateProject.bind(null, locale, project.id);
  const onDelete = deleteProject.bind(null, locale, project.id);

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/projects`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("projects.title")}
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-primary sm:text-3xl">
          {t("projects.editTitle")}
        </h1>

        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
          <Link
            href={`/${locale}/admin/progress/${project.id}`}
            className="inline-flex items-center gap-1.5 text-accent-700 hover:text-accent-800"
          >
            <HardHat size={14} aria-hidden />
            {t("projects.manageProgress")}
          </Link>

          <Link
            href={`/${locale}/admin/projects/${project.id}/units`}
            className="inline-flex items-center gap-1.5 text-accent-700 hover:text-accent-800"
          >
            <Grid3x3 size={14} aria-hidden />
            {t("projects.manageUnits")}
          </Link>

          <Link
            href={`/${locale}/admin/projects/${project.id}/facilities`}
            className="inline-flex items-center gap-1.5 text-accent-700 hover:text-accent-800"
          >
            <ImageIcon size={14} aria-hidden />
            {t("projects.manageFacilities")}
          </Link>

          <Link
            href={`/${locale}/admin/projects/${project.id}/unit-types`}
            className="inline-flex items-center gap-1.5 text-accent-700 hover:text-accent-800"
          >
            <Layers size={14} aria-hidden />
            {t("projects.manageUnitTypes")}
          </Link>

          {project.isPublished && (
            <Link
              href={`/${locale}/projects/${project.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-ink-muted hover:text-primary"
            >
              <ExternalLink size={14} aria-hidden />
              /{project.slug}
            </Link>
          )}
        </div>
      </header>

      {searchParams.created && (
        <SaveToast tone="success" token="created">
          <CheckCircle2 size={16} aria-hidden />
          {t("common.saved")}
        </SaveToast>
      )}

      <LanguageTabs
        active={lang}
        completeness={completeness}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <ProjectForm
        key={lang}
        locale={locale}
        lang={lang}
        action={action}
        values={values}
        onDelete={onDelete}
        submitLabel={t("common.save")}
      />

    </div>
  );
}
