/**
 * app/[locale]/admin/pages/faq/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * FAQ manager: add at the top, each entry editable in place, grouped by
 * category so the order a visitor sees is the order the editor sees.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { Plus, HelpCircle } from "lucide-react";
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
import AdminDrawer from "@/components/admin/ui/AdminDrawer";
import CollectionGrid, { collectionHref } from "@/components/admin/ui/CollectionGrid";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string; edit?: string }> };

export default async function AdminFaqsPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const { locale } = params;

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

  const base = `/${locale}/admin/pages/faq`;
  const href = (edit: string | null) => collectionHref(base, searchParams.lang, edit);
  // "new" only for a role that can save it; an unknown id opens nothing.
  const target =
    searchParams.edit === "new"
      ? canWrite
        ? ("new" as const)
        : null
      : (faqs.find((row: any) => row.id === searchParams.edit) ?? null);
  const tr = target && target !== "new" ? pickEditingTranslation<any>(target.translations, lang) : undefined;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={t("faqs.title")}
        description={t("faqs.subtitle")}
        actions={
          canWrite ? (
            <Link href={href("new")} scroll={false} className="admin-btn">
              <Plus size={15} aria-hidden />
              {t("faqs.newTitle")}
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
        columns={2}
        items={faqs.map((row: any) => ({
          id: row.id,
          href: href(row.id),
          title: (locale === "th" ? row.questionTh : row.questionEn) || row.questionEn,
          subtitle: null,
          imageUrl: null,
          tag: row.category,
          meta: `#${row.sortOrder}`,
          visible: row.isPublished,
          completeness: translationCompleteness<any>(row.translations, "question"),
        }))}
        labels={{
          visible: t("common.published"),
          hidden: t("common.draft"),
          missingThai: t("common.missingThai"),
          empty: t("faqs.empty"),
        }}
      />

      {target && (
        <AdminDrawer
          title={
            target === "new"
              ? t("faqs.newTitle")
              : (locale === "th" ? target.questionTh : target.questionEn) || target.questionEn
          }
          icon={<HelpCircle size={18} aria-hidden />}
          closeHref={href(null)}
          closeLabel={t("leadDrawer.close")}
        >
          <div className="space-y-5">
            <LanguageTabs
              active={lang}
              completeness={
                target === "new"
                  ? { en: true, th: true, zh: true, ru: true }
                  : translationCompleteness<any>(target.translations, "question")
              }
              completeLabel={t("common.translationComplete")}
              missingLabel={t("common.translationMissing")}
            />
            <fieldset disabled={!canWrite} className="contents">
              {target === "new" ? (
                <FaqForm
                  key={lang}
                  lang={lang}
                  action={createFaq}
                  existingCategories={categories}
                  submitLabel={t("common.create")}
                  formId="faq-new"
                />
              ) : (
                <FaqForm
                  key={`${target.id}:${lang}`}
                  lang={lang}
                  action={updateFaq.bind(null, target.id)}
                  onDelete={deleteFaq.bind(null, target.id)}
                  existingCategories={categories}
                  formId={`faq-${target.id}`}
                  values={{
                    question: tr?.question ?? "",
                    answer: tr?.answer ?? "",
                    category: target.category ?? "",
                    isPublished: target.isPublished,
                    sortOrder: String(target.sortOrder),
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
