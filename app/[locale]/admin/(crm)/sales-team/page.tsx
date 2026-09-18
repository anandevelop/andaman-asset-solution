/**
 * app/[locale]/admin/sales-team/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sales team: add at the top, every existing person editable in place —
 * same arrangement as /admin/faqs. Reordering is the sortOrder field on
 * each form, not drag-and-drop, matching every other list in this admin
 * (progress months, FAQs).
 */

import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createSalesPerson, deleteSalesPerson, updateSalesPerson } from "./actions";
import SalesPersonForm from "@/components/admin/SalesPersonForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function AdminSalesTeamPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });
  const db = prisma;
  const lang = parseEditingLocale(searchParams.lang);

  const team = await safeQuery(
    "admin:salesPeople",
    () =>
      db.salesPerson.findMany({
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
          {t("salesTeam.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("salesTeam.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* One language selection drives every person's form on this page —
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
          {t("salesTeam.newTitle")}
        </h2>

        <SalesPersonForm
          key={lang}
          lang={lang}
          action={createSalesPerson.bind(null, locale)}
          submitLabel={t("common.create")}
        />
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {team.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("salesTeam.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {team.map((person: any) => {
            const completeness = translationCompleteness<any>(person.translations, "name");
            const editing = pickEditingTranslation<any>(person.translations, lang);

            return (
              <section key={person.id} className="admin-card">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-base font-semibold text-primary">{person.nameEn}</h2>
                    <TranslationStatusBadges completeness={completeness} />
                  </div>

                  <span
                    className={
                      person.isActive
                        ? "rounded-sm bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        : "rounded-sm bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                    }
                  >
                    {person.isActive ? t("salesTeam.active") : t("salesTeam.inactive")}
                  </span>
                </div>

                <SalesPersonForm
                  key={lang}
                  lang={lang}
                  action={updateSalesPerson.bind(null, locale, person.id)}
                  onDelete={deleteSalesPerson.bind(null, locale, person.id)}
                  values={{
                    name: editing?.name ?? "",
                    position: editing?.position ?? "",
                    whatsappNumber: person.whatsappNumber,
                    phoneNumber: person.phoneNumber,
                    email: person.email ?? "",
                    photoUrl: person.photoUrl ?? "",
                    isActive: person.isActive,
                    sortOrder: String(person.sortOrder),
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
