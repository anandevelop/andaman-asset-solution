/**
 * app/[locale]/admin/attractions/[projectId]/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Manage Nearby Attraction categories + items for one project, or — when
 * the route param is the literal "shared" — the shared default set every
 * project without categories of its own falls back to. See the model
 * comment on NearbyAttractionCategory in schema.prisma for the fallback
 * rule this page's two modes correspond to.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import AttractionCategoryForm from "@/components/admin/AttractionCategoryForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";
import { saveAttractionCategory, deleteAttractionCategory } from "../actions";

type Props = {
  params: { locale: string; projectId: string };
  searchParams: { lang?: string };
};

export default async function AdminAttractionsPage({ params, searchParams }: Props) {
  const { locale, projectId: rawProjectId } = params;
  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });
  const isShared = rawProjectId === "shared";
  const projectId = isShared ? null : rawProjectId;
  const lang = parseEditingLocale(searchParams.lang);

  const db = prisma as any; // sandbox: as-any — see the cast note in ../actions.ts

  let projectName: string | null = null;
  if (!isShared) {
    const project = await db.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { nameEn: true, nameTh: true },
    });
    if (!project) notFound();
    projectName = locale === "th" ? project.nameTh : project.nameEn;
  }

  const categories = await db.nearbyAttractionCategory.findMany({
    where: { projectId },
    orderBy: { sortOrder: "asc" },
    include: {
      translations: true,
      items: { orderBy: { sortOrder: "asc" }, include: { translations: true } },
    },
  });

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/attractions`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("attractions.title")}
        </Link>

        <p className="admin-section-title mt-4">{t("attractions.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {isShared ? t("attractions.sharedDefault") : projectName}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">
          {isShared ? t("attractions.sharedDefaultHint") : t("attractions.projectHint")}
        </p>
      </header>

      {/* One language selection drives every category's form on this page —
          see the file comment on LanguageTabs. */}
      <LanguageTabs
        active={lang}
        completeness={{ en: true, th: true, zh: true, ru: true }}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      {/* ── Add a category ──────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-primary">
          <Plus size={16} className="text-accent-700" aria-hidden />
          {t("attractions.addCategory")}
        </h2>
        <AttractionCategoryForm
          key={lang}
          lang={lang}
          action={saveAttractionCategory.bind(null, locale, projectId, null)}
          submitLabel={t("common.create")}
        />
      </section>

      {/* ── Existing categories ─────────────────────────────────────── */}
      {categories.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("attractions.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((cat: any) => {
            const completeness = translationCompleteness<any>(cat.translations, "categoryName");
            const editingCategory = pickEditingTranslation<any>(cat.translations, lang);

            return (
              <div key={cat.id} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <span className="text-xs font-medium text-ink-muted">{cat.categoryNameEn}</span>
                  <TranslationStatusBadges completeness={completeness} />
                </div>
                <AttractionCategoryForm
                  key={lang}
                  lang={lang}
                  action={saveAttractionCategory.bind(null, locale, projectId, cat.id)}
                  onDelete={deleteAttractionCategory.bind(null, locale, projectId, cat.id)}
                  categoryName={editingCategory?.categoryName ?? ""}
                  sortOrder={String(cat.sortOrder)}
                  items={cat.items.map((item: any) => ({
                    id: item.id,
                    name: pickEditingTranslation<any>(item.translations, lang)?.name ?? "",
                    distanceKm: String(item.distanceKm),
                    durationMin: String(item.durationMin),
                  }))}
                  submitLabel={t("common.save")}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
