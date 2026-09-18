/**
 * app/[locale]/admin/pages/faq/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * FAQ manager: add at the top, each entry editable in place, grouped by
 * category so the order a visitor sees is the order the editor sees.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getFaqCategories } from "@/lib/faqs";
import { parseEditingLocale, pickEditingTranslation, translationCompleteness } from "@/lib/admin/translated-form";
import { createFaq, deleteFaq, updateFaq } from "./actions";
import FaqForm from "@/components/admin/FaqForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function AdminFaqsPage(props: Props) {
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

  const lang = parseEditingLocale(searchParams.lang);

  const [t, faqs, categories] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    safeQuery(
      "admin:faqs",
      () =>
        prisma.faq.findMany({
          orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
          include: { translations: true },
        }),
      [] as any[],
    ),
    getFaqCategories(),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("faqs.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-muted">{t("faqs.subtitle")}</p>
      </header>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {/* One language selection drives every FAQ's form on this page —
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
          {t("faqs.newTitle")}
        </h2>

        <fieldset disabled={!canWrite} className="contents">
          <FaqForm
            key={lang}
            lang={lang}
            action={createFaq}
            existingCategories={categories}
            submitLabel={t("common.create")}
            formId="faq-new"
          />
        </fieldset>
      </section>

      {/* ── Existing ────────────────────────────────────────────────── */}
      {faqs.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("faqs.empty")}
        </div>
      ) : (
        <div className="space-y-6">
          {faqs.map((faq: any) => {
            const completeness = translationCompleteness<any>(faq.translations, "question");
            const editing = pickEditingTranslation<any>(faq.translations, lang);

            return (
              <section key={faq.id} className="admin-card">
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-semibold text-primary">
                        {locale === "th" ? faq.questionTh : faq.questionEn}
                      </h2>
                      <TranslationStatusBadges completeness={completeness} />
                    </div>
                    {faq.category && (
                      <p className="mt-1 text-xs uppercase tracking-wide text-accent-700">
                        {faq.category}
                      </p>
                    )}
                  </div>

                  <span
                    className={
                      faq.isPublished
                        ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                        : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                    }
                  >
                    {faq.isPublished ? t("common.published") : t("common.draft")}
                  </span>
                </div>

                <fieldset disabled={!canWrite} className="contents">
                  <FaqForm
                    key={lang}
                    lang={lang}
                    action={updateFaq.bind(null, faq.id)}
                    onDelete={deleteFaq.bind(null, faq.id)}
                    existingCategories={categories}
                    formId={`faq-${faq.id}`}
                    values={{
                      question: editing?.question ?? "",
                      answer: editing?.answer ?? "",
                      category: faq.category ?? "",
                      isPublished: faq.isPublished,
                      sortOrder: String(faq.sortOrder),
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
