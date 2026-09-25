/**
 * app/[locale]/admin/projects/[id]/facilities/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Facilities: add at the top, every existing facility editable in place —
 * same arrangement as /admin/pages/about/awards and /admin/sales-team, just scoped to
 * one project instead of global (a "Clubhouse" card on this project can
 * carry a different photo, or none, from "Clubhouse" on another — see the
 * model comment on ProjectFacility in schema.prisma).
 */

import Link from "next/link";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createProjectFacility, deleteProjectFacility, updateProjectFacility } from "./actions";
import ProjectFacilityForm from "@/components/admin/ProjectFacilityForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ lang?: string }>;
};

export default async function AdminProjectFacilitiesPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const { locale, id: projectId } = params;
  /* VIEWER may open this to see a project's facilities; only EDITOR
     and above may submit either form below (canWrite gates both with a
     disabled fieldset). */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;
  const lang = parseEditingLocale(searchParams.lang);

  const project = await db.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, slug: true, nameEn: true, nameTh: true },
  });
  if (!project) notFound();

  const facilities = await db.projectFacility.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { translations: true },
  });

  const projectName = locale === "th" ? project.nameTh : project.nameEn;

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/projects/${project.id}/edit`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {projectName}
        </Link>

        <p className="admin-section-title mt-4">{t("facilities.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{projectName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("facilities.subtitle")}</p>
      </header>

      <ProjectHubTabs
        locale={locale}
        projectId={project.id}
        active="facilities"
      />

      {/* One language selection drives every facility's form on this page —
          see the file comment on LanguageTabs. */}
      <LanguageTabs
        active={lang}
        completeness={{ en: true, th: true, zh: true, ru: true }}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      {/* ── Add ─────────────────────────────────────────────────────── */}
      <section className="admin-card">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("facilities.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <ProjectFacilityForm
            key={lang}
            lang={lang}
            action={createProjectFacility.bind(null, locale, project.id, project.slug)}
            submitLabel={t("common.create")}
          />
        </fieldset>
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {facilities.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("facilities.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {facilities.map((facility: any) => {
            const completeness = translationCompleteness<any>(facility.translations, "name");
            const editing = pickEditingTranslation<any>(facility.translations, lang);

            return (
              <section key={facility.id} className="admin-card">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-primary">{facility.nameEn}</h2>
                    <TranslationStatusBadges completeness={completeness} />
                  </div>

                  <span
                    className={
                      facility.isActive
                        ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                    }
                  >
                    {facility.isActive ? t("facilities.active") : t("facilities.inactive")}
                  </span>
                </div>

                <fieldset disabled={!canWrite} className="contents">
                  <ProjectFacilityForm
                    key={lang}
                    lang={lang}
                    action={updateProjectFacility.bind(
                      null,
                      locale,
                      project.id,
                      project.slug,
                      facility.id,
                    )}
                    onDelete={deleteProjectFacility.bind(
                      null,
                      locale,
                      project.id,
                      project.slug,
                      facility.id,
                    )}
                    values={{
                      name: editing?.name ?? "",
                      imageUrl: facility.imageUrl ?? "",
                      isActive: facility.isActive,
                      sortOrder: String(facility.sortOrder),
                    }}
                    submitLabel={t("common.save")}
                  />
                </fieldset>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
