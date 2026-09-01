/**
 * app/[locale]/admin/projects/[id]/unit-types/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Unit Types: add at the top, every existing type editable in place
 * (specs + its own floor-plan photos) — same arrangement as
 * ../facilities/page.tsx, just one field deeper (each type carries its
 * own nested FloorPlansEditor rather than a single image field).
 *
 * sandbox: `prisma as any` — ProjectUnitType/FloorPlan predate a runnable
 * `prisma generate` here; see the cast note above getProjectBySlug in
 * lib/projects.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { saveUnitType, deleteUnitType } from "./actions";
import UnitTypeForm from "@/components/admin/UnitTypeForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ lang?: string }>;
};

/** null / Decimal / number → the string an <input> expects — same helper
 *  as ../edit/page.tsx's own `str()`. */
function str(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

export default async function AdminProjectUnitTypesPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;
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

  const unitTypes = await db.projectUnitType.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      floorPlans: { orderBy: { sortOrder: "asc" } },
      translations: true,
    },
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

        <p className="admin-section-title mt-4">{t("unitTypes.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{projectName}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("unitTypes.subtitle")}</p>
      </header>

      {/* One language selection drives every unit type's description field
          on this page — see the file comment on LanguageTabs. Hardcoded
          "all complete" here for the same reason facilities/page.tsx's
          does: this tab row switches the whole page's language, not one
          record's, so per-record completeness is shown separately via
          TranslationStatusBadges next to each type's own heading below. */}
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
          {t("unitTypes.newTitle")}
        </h2>

        <UnitTypeForm
          key={lang}
          lang={lang}
          projectSlug={project.slug}
          action={saveUnitType.bind(null, locale, project.id, project.slug, null)}
          submitLabel={t("common.create")}
        />
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {unitTypes.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("unitTypes.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {unitTypes.map((type: any) => {
            const completeness = translationCompleteness<any>(type.translations, "description");
            const editing = pickEditingTranslation<any>(type.translations, lang);

            return (
              <section key={type.id} className="admin-card">
                <div className="mb-5 flex flex-wrap items-center gap-3">
                  <h2 className="text-base font-semibold text-primary">{type.name}</h2>
                  <TranslationStatusBadges completeness={completeness} />
                </div>

                <UnitTypeForm
                  key={lang}
                  lang={lang}
                  projectSlug={project.slug}
                  action={saveUnitType.bind(null, locale, project.id, project.slug, type.id)}
                  onDelete={deleteUnitType.bind(null, locale, project.id, project.slug, type.id)}
                  values={{
                    name: type.name,
                    description: editing?.description ?? "",
                    livingAreaSqm: str(type.livingAreaSqm),
                    bedrooms: str(type.bedrooms),
                    bathrooms: str(type.bathrooms),
                    totalUnits: str(type.totalUnits),
                    sortOrder: String(type.sortOrder),
                    floorPlans: type.floorPlans.map((fp: any) => ({
                      id: fp.id,
                      floorName: fp.floorName,
                      imageUrl: fp.imageUrl,
                    })),
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
