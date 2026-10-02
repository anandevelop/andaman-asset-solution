/**
 * app/[locale]/admin/pages/home/hero/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Hero Story Banner: add at the top, every existing slide editable in
 * place — same arrangement as /admin/pages/about/awards. Reordering is the sortOrder
 * field on each form, not drag-and-drop, matching every other list in this
 * admin; "toggling" a slide off is the isActive checkbox on its form.
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus, Images } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { toDateTimeLocal } from "@/lib/format";
import { createHeroStorySlide, deleteHeroStorySlide, updateHeroStorySlide } from "./actions";
import HeroStorySlideForm from "@/components/admin/HeroStorySlideForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import CollectionGrid, { collectionHref } from "@/components/admin/ui/CollectionGrid";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string; edit?: string }> };

export default async function AdminHeroBannerPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const { locale } = params;

  /* VIEWER may open this page to see what is published; only EDITOR
     and above may submit either form below (canWrite gates both with a
     disabled fieldset, matching the zone's real minimum, unchanged from
     before this phase — see the actions in ./actions.ts). */
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;
  const lang = parseEditingLocale(searchParams.lang);

  const slides = await safeQuery(
    "admin:heroStorySlides",
    () =>
      db.heroStorySlide.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { translations: true },
      }),
    [] as any[],
  );

  const base = `/${locale}/admin/pages/home/hero`;
  const href = (edit: string | null) => collectionHref(base, searchParams.lang, edit);
  // "new" only for a role that can save it; an unknown id opens nothing.
  const target =
    searchParams.edit === "new"
      ? canWrite
        ? ("new" as const)
        : null
      : (slides.find((row: any) => row.id === searchParams.edit) ?? null);
  const tr = target && target !== "new" ? pickEditingTranslation<any>(target.translations, lang) : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("heroBanner.title")}
        description={t("heroBanner.subtitle")}
        actions={
          canWrite ? (
            <Link href={href("new")} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("heroBanner.newTitle")}
            </Link>
          ) : undefined
        }
      />

      {isDatabaseOffline() && (
        <p className="rounded-control border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <CollectionGrid
        columns={3}
        hasImages
        items={slides.map((row: any) => ({
          id: row.id,
          href: href(row.id),
          title:
            pickEditingTranslation<any>(row.translations, locale)?.caption ||
            pickEditingTranslation<any>(row.translations, "en")?.caption ||
            t("heroBanner.mediaTypeImage"),
          subtitle: pickEditingTranslation<any>(row.translations, locale)?.tagline || null,
          imageUrl: row.mediaType === "VIDEO" ? row.posterImageUrl : row.mediaUrl,
          tag: row.mediaType === "VIDEO" ? t("heroBanner.mediaTypeVideo") : t("heroBanner.mediaTypeImage"),
          meta: `#${row.sortOrder}`,
          visible: row.isActive,
          completeness: translationCompleteness<any>(row.translations, "caption"),
        }))}
        labels={{
          visible: t("heroBanner.active"),
          hidden: t("heroBanner.inactive"),
          missingThai: t("common.missingThai"),
          empty: t("heroBanner.empty"),
        }}
      />

      {target && (
        <AdminDrawer
          title={
            target === "new"
              ? t("heroBanner.newTitle")
              : `${target.mediaType === "VIDEO" ? t("heroBanner.mediaTypeVideo") : t("heroBanner.mediaTypeImage")} · #${target.sortOrder}`
          }
          icon={<Images size={18} aria-hidden />}
          closeHref={href(null)}
          closeLabel={t("leadDrawer.close")}
        >
          <div className="space-y-5">
            <LanguageTabs
              active={lang}
              completeness={
                target === "new"
                  ? { en: true, th: true, zh: true, ru: true }
                  : translationCompleteness<any>(target.translations, "caption")
              }
              completeLabel={t("common.translationComplete")}
              missingLabel={t("common.translationMissing")}
            />
            <fieldset disabled={!canWrite} className="contents">
              {target === "new" ? (
                <HeroStorySlideForm
                  key={lang}
                  lang={lang}
                  action={createHeroStorySlide.bind(null, locale)}
                  submitLabel={t("common.create")}
                />
              ) : (
                <HeroStorySlideForm
                  key={`${target.id}:${lang}`}
                  lang={lang}
                  action={updateHeroStorySlide.bind(null, locale, target.id)}
                  onDelete={deleteHeroStorySlide.bind(null, locale, target.id)}
                  values={{
                    mediaType: target.mediaType,
                    mediaUrl: target.mediaUrl,
                    posterImageUrl: target.posterImageUrl ?? "",
                    durationSeconds: String(target.durationSeconds),
                    ctaUrl: target.ctaUrl ?? "",
                    label: tr?.label ?? "",
                    caption: tr?.caption ?? "",
                    tagline: tr?.tagline ?? "",
                    ctaLabel: tr?.ctaLabel ?? "",
                    isActive: target.isActive,
                    sortOrder: String(target.sortOrder),
                    startAt: toDateTimeLocal(target.startAt),
                    endAt: toDateTimeLocal(target.endAt),
                  }}
                  submitLabel={t("common.save")}
                />
              )}
            </fieldset>
          </div>
        </AdminDrawer>
      )}
    </div>
  );
}
