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
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import {
  parseEditingLocale,
  pickEditingTranslation,
  translationCompleteness,
} from "@/lib/admin/translated-form";
import { getProjectReadiness } from "@/lib/admin/project-readiness";
import { deleteProject, updateProject } from "../../actions";
import ProjectForm, { type ProjectFormValues } from "@/components/admin/ProjectForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import SaveToast from "@/components/admin/SaveToast";
import PublishingRevisionPanel from "@/components/admin/PublishingRevisionPanel";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import ProjectReadinessPanel from "@/components/admin/ProjectReadinessPanel";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ created?: string; lang?: string }>;
};

/** null / Decimal / number → the string an <input> expects. */
function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default async function EditProjectPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, id } = params;
  // VIEWER may open this to see a project's own overview; saving or
  // deleting stays behind a disabled fieldset for anyone below EDITOR.
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const lang = parseEditingLocale(searchParams.lang);

  /* Two reads, in parallel. The readiness panel deliberately runs its own
     single query rather than deriving from `project` below: it needs the
     unit-type count and this month's progress, which this fetch does not
     pull, and widening this one to include them would make every Overview
     load carry them whether the panel renders or not. See
     lib/admin/project-readiness.ts's header. */
  const [project, readiness] = await Promise.all([
    prisma.project.findFirst({
      where: { id, deletedAt: null },
      include: { translations: true },
    }) as Promise<any>,
    getProjectReadiness(id),
  ]);

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
    virtualTourUrl: str(project.virtualTourUrl),
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

      <ProjectHubTabs
        locale={locale}
        projectId={project.id}
        active="overview"
      />

      {searchParams.created && (
        <SaveToast tone="success" token="created">
          <CheckCircle2 size={16} aria-hidden />
          {t("common.saved")}
        </SaveToast>
      )}

      <PublishingRevisionPanel
        locale={locale}
        type="PROJECT"
        id={project.id}
        labels={{
          toggle: t("publishing.revision.toggle"),
          compareTitle: t("publishing.revision.compareTitle"),
          noRevisionYet: t("publishing.revision.noRevisionYet"),
          currentLabel: t("publishing.revision.currentLabel"),
          publishedLabel: t("publishing.revision.publishedLabel"),
          historyTitle: t("publishing.revision.historyTitle"),
          historyEmpty: t("publishing.revision.historyEmpty"),
          revertAction: t("publishing.revision.revertAction"),
          confirmRevert: t("publishing.revision.confirmRevert"),
          error: t("common.error"),
          autoEditBadge: t("publishing.revision.autoEditBadge"),
        }}
      />

      {/* The form, and beside it what is still outstanding across the
          other six tabs. The panel is second in the DOM so a narrow screen
          stacks it under the form rather than pushing the form below a
          checklist nobody opened this page to read. */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-8">
          <LanguageTabs
            active={lang}
            completeness={completeness}
            completeLabel={t("common.translationComplete")}
            missingLabel={t("common.translationMissing")}
          />

          <fieldset disabled={!canWrite} className="contents">
            <ProjectForm
              key={lang}
              locale={locale}
              lang={lang}
              action={action}
              values={values}
              onDelete={onDelete}
              submitLabel={t("common.save")}
            />
          </fieldset>
        </div>

        <ProjectReadinessPanel locale={locale} projectId={project.id} readiness={readiness} />
      </div>
    </div>
  );
}
