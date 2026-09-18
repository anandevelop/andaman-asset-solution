/**
 * app/[locale]/admin/pages/about/why-us/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Why us": add at the top, every existing point editable in place — same
 * arrangement as /admin/pages/about/awards. Reordering is the sortOrder field on each
 * form, not drag-and-drop, matching every other list in this admin.
 */

import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createWhyUsPoint, deleteWhyUsPoint, updateWhyUsPoint } from "./actions";
import WhyUsPointForm from "@/components/admin/WhyUsPointForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function AdminWhyUsPage(props: Props) {
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

  const points = await safeQuery(
    "admin:whyUsPoints",
    () =>
      db.whyUsPoint.findMany({
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
          {t("whyUs.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("whyUs.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

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
          {t("whyUs.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <WhyUsPointForm
            key={lang}
            lang={lang}
            action={createWhyUsPoint.bind(null, locale)}
            submitLabel={t("common.create")}
          />
        </fieldset>
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {points.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("whyUs.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {points.map((point: any) => {
            const completeness = translationCompleteness<any>(point.translations, "title");
            const editing = pickEditingTranslation<any>(point.translations, lang);

            return (
              <section key={point.id} className="admin-card">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-primary">
                      {editing?.title ?? point.translations[0]?.title ?? point.id}
                    </h2>
                    <TranslationStatusBadges completeness={completeness} />
                  </div>

                  <span
                    className={
                      point.isActive
                        ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                    }
                  >
                    {point.isActive ? t("whyUs.active") : t("whyUs.inactive")}
                  </span>
                </div>

                <fieldset disabled={!canWrite} className="contents">
                  <WhyUsPointForm
                    key={lang}
                    lang={lang}
                    action={updateWhyUsPoint.bind(null, locale, point.id)}
                    onDelete={deleteWhyUsPoint.bind(null, locale, point.id)}
                    values={{
                      icon: point.icon,
                      title: editing?.title ?? "",
                      body: editing?.body ?? "",
                      isActive: point.isActive,
                      sortOrder: String(point.sortOrder),
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
