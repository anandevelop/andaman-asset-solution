/**
 * app/[locale]/admin/pages/home/hero/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Hero Story Banner: add at the top, every existing slide editable in
 * place — same arrangement as /admin/pages/about/awards. Reordering is the sortOrder
 * field on each form, not drag-and-drop, matching every other list in this
 * admin; "toggling" a slide off is the isActive checkbox on its form.
 */

import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
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
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function AdminHeroBannerPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

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

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("heroBanner.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("heroBanner.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* One language selection drives every slide's caption/CTA form on
          this page — see the file comment on LanguageTabs for why a shared
          page-level `?lang=` beats a per-card control. */}
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
          {t("heroBanner.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <HeroStorySlideForm
            key={lang}
            lang={lang}
            action={createHeroStorySlide.bind(null, locale)}
            submitLabel={t("common.create")}
          />
        </fieldset>
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {slides.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("heroBanner.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {slides.map((slide: any) => {
            const completeness = translationCompleteness<any>(slide.translations, "caption");
            const editing = pickEditingTranslation<any>(slide.translations, lang);

            return (
              <section key={slide.id} className="admin-card">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-primary">
                      {slide.mediaType === "VIDEO"
                        ? t("heroBanner.mediaTypeVideo")
                        : t("heroBanner.mediaTypeImage")}
                      {" · #"}
                      {slide.sortOrder}
                    </h2>
                    <TranslationStatusBadges completeness={completeness} />
                  </div>

                  <span
                    className={
                      slide.isActive
                        ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                    }
                  >
                    {slide.isActive ? t("heroBanner.active") : t("heroBanner.inactive")}
                  </span>
                </div>

                <fieldset disabled={!canWrite} className="contents">
                  <HeroStorySlideForm
                    key={lang}
                    lang={lang}
                    action={updateHeroStorySlide.bind(null, locale, slide.id)}
                    onDelete={deleteHeroStorySlide.bind(null, locale, slide.id)}
                    values={{
                      mediaType: slide.mediaType,
                      mediaUrl: slide.mediaUrl,
                      posterImageUrl: slide.posterImageUrl ?? "",
                      durationSeconds: String(slide.durationSeconds),
                      ctaUrl: slide.ctaUrl ?? "",
                      label: editing?.label ?? "",
                      caption: editing?.caption ?? "",
                      tagline: editing?.tagline ?? "",
                      ctaLabel: editing?.ctaLabel ?? "",
                      isActive: slide.isActive,
                      sortOrder: String(slide.sortOrder),
                      startAt: toDateTimeLocal(slide.startAt),
                      endAt: toDateTimeLocal(slide.endAt),
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
