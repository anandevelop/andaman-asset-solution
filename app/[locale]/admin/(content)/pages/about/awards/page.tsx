/**
 * app/[locale]/admin/pages/about/awards/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Awards: add at the top, every existing award editable in place — same
 * arrangement as /admin/sales-team. Reordering is the sortOrder field on
 * each form, not drag-and-drop, matching every other list in this admin.
 */

import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createAward, deleteAward, updateAward } from "./actions";
import AwardForm from "@/components/admin/AwardForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function AdminAwardsPage(props: Props) {
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

  const awards = await safeQuery(
    "admin:awards",
    () =>
      db.award.findMany({
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
          {t("awards.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("awards.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* One language selection drives every award's form on this page —
          see the file comment on LanguageTabs for why a shared page-level
          `?lang=` beats a per-card control. */}
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
          {t("awards.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <AwardForm
            key={lang}
            lang={lang}
            action={createAward.bind(null, locale)}
            submitLabel={t("common.create")}
          />
        </fieldset>
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {awards.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("awards.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {awards.map((award: any) => {
            const completeness = translationCompleteness<any>(award.translations, "title");
            const editing = pickEditingTranslation<any>(award.translations, lang);

            return (
              <section key={award.id} className="admin-card">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-primary">
                      {award.titleEn}
                    </h2>
                    <TranslationStatusBadges completeness={completeness} />
                  </div>

                  <span
                    className={
                      award.isActive
                        ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                    }
                  >
                    {award.isActive ? t("awards.active") : t("awards.inactive")}
                  </span>
                </div>

                <fieldset disabled={!canWrite} className="contents">
                  <AwardForm
                    key={lang}
                    lang={lang}
                    action={updateAward.bind(null, locale, award.id)}
                    onDelete={deleteAward.bind(null, locale, award.id)}
                    values={{
                      title: editing?.title ?? "",
                      organization: award.organization,
                      projectName: award.projectName ?? "",
                      year: String(award.year),
                      trophyImageUrl: award.trophyImageUrl ?? "",
                      isActive: award.isActive,
                      sortOrder: String(award.sortOrder),
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
