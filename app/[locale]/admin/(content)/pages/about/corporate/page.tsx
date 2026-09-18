/**
 * app/[locale]/admin/pages/about/corporate/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Corporate services: add at the top, every existing service editable in
 * place — same arrangement as /admin/pages/about/awards. Reordering is the sortOrder
 * field on each form, not drag-and-drop, matching every other list in
 * this admin.
 *
 * The public page sets these as a row of four tall cards — see
 * CorporateService's schema.prisma comment — so a 5th active row wraps and
 * leaves one card alone on a second line. Worth knowing before adding one;
 * not enforced here. The section's heading counts the active rows, so
 * switching one off is safe: the heading follows.
 */

import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createCorporateService, deleteCorporateService, updateCorporateService } from "./actions";
import CorporateServiceForm from "@/components/admin/CorporateServiceForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function AdminCorporatePage(props: Props) {
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

  const services = await safeQuery(
    "admin:corporateServices",
    () =>
      db.corporateService.findMany({
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
          {t("corporate.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("corporate.subtitle")}</p>
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
          {t("corporate.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <CorporateServiceForm
            key={lang}
            lang={lang}
            action={createCorporateService.bind(null, locale)}
            submitLabel={t("common.create")}
          />
        </fieldset>
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {services.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("corporate.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {services.map((service: any) => {
            const completeness = translationCompleteness<any>(service.translations, "label");
            const editing = pickEditingTranslation<any>(service.translations, lang);

            return (
              <section key={service.id} className="admin-card">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-primary">
                      {editing?.label ?? service.translations[0]?.label ?? service.id}
                    </h2>
                    <TranslationStatusBadges completeness={completeness} />
                  </div>

                  <span
                    className={
                      service.isActive
                        ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                    }
                  >
                    {service.isActive ? t("corporate.active") : t("corporate.inactive")}
                  </span>
                </div>

                <fieldset disabled={!canWrite} className="contents">
                  <CorporateServiceForm
                    key={lang}
                    lang={lang}
                    action={updateCorporateService.bind(null, locale, service.id)}
                    onDelete={deleteCorporateService.bind(null, locale, service.id)}
                    values={{
                      label: editing?.label ?? "",
                      imageAlt: editing?.imageAlt ?? "",
                      imageUrl: service.imageUrl,
                      isActive: service.isActive,
                      sortOrder: String(service.sortOrder),
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
