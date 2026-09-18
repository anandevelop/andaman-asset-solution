/**
 * app/[locale]/admin/news/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Article index. "Scheduled" is called out as its own state — an article
 * that is published with a future date is invisible on the site, and an
 * editor seeing a plain "Published" badge would reasonably assume it is
 * live and go looking for a bug.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock, Pencil, Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import { translationCompleteness } from "@/lib/admin/translated-form";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminNewsPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });

  const articles = await safeQuery(
    "admin:news",
    () =>
      prisma.newsArticle.findMany({
        where: { deletedAt: null },
        orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          slug: true,
          titleEn: true,
          titleTh: true,
          category: true,
          isPublished: true,
          publishedAt: true,
          updatedAt: true,
          translations: true,
          author: { select: { name: true } },
        },
      }),
    [] as any[],
  );

  const offline = isDatabaseOffline();
  const now = new Date();

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("brand")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
            {t("news.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("news.subtitle")}</p>
        </div>

        <Link href={`/${locale}/admin/news/new`} className="admin-btn">
          <Plus size={16} aria-hidden />
          {t("news.new")}
        </Link>
      </header>

      {offline && (
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {articles.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("news.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-primary/10 bg-surface-raised shadow-card">
          <table className="w-full min-w-[820px] border-collapse">
            <thead className="border-b border-primary/10 bg-surface-muted">
              <tr>
                <th className="admin-th">{t("news.articleTitle")}</th>
                <th className="admin-th">{t("news.category")}</th>
                <th className="admin-th">{t("news.author")}</th>
                <th className="admin-th">{t("common.published")}</th>
                <th className="admin-th">{t("projects.updated")}</th>
                <th className="admin-th" />
              </tr>
            </thead>

            <tbody className="divide-y divide-primary/5">
              {articles.map((article: any) => {
                const scheduled =
                  article.isPublished &&
                  article.publishedAt !== null &&
                  article.publishedAt > now;
                const completeness = translationCompleteness<any>(article.translations, "title");

                return (
                  <tr
                    key={article.id}
                    className="transition-colors hover:bg-surface-muted/60"
                  >
                    <td className="admin-td">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-primary">
                          {locale === "th" ? article.titleTh : article.titleEn}
                        </p>
                        <TranslationStatusBadges completeness={completeness} />
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">
                        /{article.slug}
                      </p>
                    </td>

                    <td className="admin-td whitespace-nowrap text-ink-muted">
                      {article.category ?? t("common.none")}
                    </td>

                    <td className="admin-td whitespace-nowrap text-ink-muted">
                      {article.author?.name ?? t("common.none")}
                    </td>

                    <td className="admin-td whitespace-nowrap">
                      {scheduled ? (
                        <span className="inline-flex items-center gap-1.5 rounded-sm bg-accent-50 px-2 py-1 text-xs font-medium text-accent-700">
                          <CalendarClock size={12} aria-hidden />
                          {t("news.scheduled")}
                        </span>
                      ) : article.isPublished ? (
                        <span className="rounded-sm bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                          {t("common.published")}
                        </span>
                      ) : (
                        <span className="rounded-sm bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted">
                          {t("common.draft")}
                        </span>
                      )}

                      {article.publishedAt && (
                        <p className="mt-1 text-xs text-ink-muted">
                          {dateFormat.format(article.publishedAt)}
                        </p>
                      )}
                    </td>

                    <td className="admin-td whitespace-nowrap text-xs text-ink-muted">
                      <time dateTime={article.updatedAt.toISOString()}>
                        {dateFormat.format(article.updatedAt)}
                      </time>
                    </td>

                    <td className="admin-td whitespace-nowrap text-right">
                      <Link
                        href={`/${locale}/admin/news/${article.id}/edit`}
                        className="inline-flex items-center gap-1.5 text-sm text-accent-700 hover:text-accent-800"
                      >
                        <Pencil size={14} aria-hidden />
                        {t("common.edit")}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
