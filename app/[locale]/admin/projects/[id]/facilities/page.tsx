/**
 * app/[locale]/admin/projects/[id]/facilities/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Facilities: add at the top, every existing facility editable in place —
 * same arrangement as /admin/awards and /admin/sales-team, just scoped to
 * one project instead of global (a "Clubhouse" card on this project can
 * carry a different photo, or none, from "Clubhouse" on another — see the
 * model comment on ProjectFacility in schema.prisma).
 *
 * sandbox: `prisma as any` — ProjectFacility was added to schema.prisma in
 * this phase; see the cast note above getProjectBySlug in lib/projects.ts
 * for why the locally generated client doesn't type it yet.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createProjectFacility, deleteProjectFacility, updateProjectFacility } from "./actions";
import ProjectFacilityForm from "@/components/admin/ProjectFacilityForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = {
  params: { locale: string; id: string };
  searchParams: { lang?: string };
};

export default async function AdminProjectFacilitiesPage({ params, searchParams }: Props) {
  const { locale, id: projectId } = params;
  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma as any;
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

        <ProjectFacilityForm
          key={lang}
          lang={lang}
          action={createProjectFacility.bind(null, locale, project.id, project.slug)}
          submitLabel={t("common.create")}
        />
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
                        ? "rounded-sm bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        : "rounded-sm bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                    }
                  >
                    {facility.isActive ? t("facilities.active") : t("facilities.inactive")}
                  </span>
                </div>

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
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
