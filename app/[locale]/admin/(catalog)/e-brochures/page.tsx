import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { translationCompleteness } from "@/lib/admin/translated-form";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }> };

type Row = {
  id: string;
  slug: string;
  isPublished: boolean;
  sortOrder: number;
  project: { nameEn: string } | null;
  translations: { locale: string; title: string }[];
};

export default async function AdminEBrochuresPage(props: Props) {
  const params = await props.params;
  const { locale } = params;

  // VIEWER may see the list; "New" follows ./new/page.tsx's own EDITOR
  // guard, and every row action is a Link to a page with its own guard.
  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });

  const brochures = await safeQuery(
    "admin:e-brochures",
    () =>
      prisma.eBrochure.findMany({
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          slug: true,
          isPublished: true,
          sortOrder: true,
          project: { select: { nameEn: true } },
          translations: { select: { locale: true, title: true } },
        },
      }) as unknown as Promise<Row[]>,
    [] as Row[],
  );

  // safeQuery degrades to [] when Postgres is unreachable, which renders as
  // "no brochures yet" — indistinguishable from someone having deleted
  // them unless the page says which it is.
  const offline = isDatabaseOffline();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("brand")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
            {t("eBrochures.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("eBrochures.subtitle")}</p>
        </div>

        {canWrite && (
          <Link href={`/${locale}/admin/e-brochures/new`} className="admin-btn">
            <Plus size={16} aria-hidden />
            {t("eBrochures.new")}
          </Link>
        )}
      </header>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {brochures.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("eBrochures.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xs border border-primary/10 bg-surface-raised shadow-card">
          <table className="w-full min-w-[820px] border-collapse">
            <thead className="border-b border-primary/10 bg-surface-muted">
              <tr>
                <th className="admin-th">{t("eBrochures.brochureTitle")}</th>
                <th className="admin-th">{t("eBrochures.project")}</th>
                <th className="admin-th">{t("common.translationComplete")}</th>
                <th className="admin-th">{t("common.published")}</th>
                <th className="admin-th" />
              </tr>
            </thead>

            <tbody className="divide-y divide-primary/5">
              {brochures.map((brochure) => {
                const completeness = translationCompleteness(
                  brochure.translations,
                  "title",
                );
                // The admin's own language, falling back to whatever exists
                // — a brochure titled only in Thai should still be findable
                // in this table by an English-speaking editor.
                const title =
                  brochure.translations.find((row) => row.locale === locale)?.title ??
                  brochure.translations[0]?.title ??
                  brochure.slug;

                return (
                  <tr
                    key={brochure.id}
                    className="transition-colors hover:bg-surface-muted/60"
                  >
                    <td className="admin-td">
                      <p className="font-medium text-primary">{title}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">/{brochure.slug}</p>
                    </td>

                    <td className="admin-td text-ink-muted">
                      {brochure.project?.nameEn ?? t("common.none")}
                    </td>

                    <td className="admin-td">
                      <TranslationStatusBadges completeness={completeness} />
                    </td>

                    <td className="admin-td">
                      {brochure.isPublished ? (
                        <span className="inline-flex rounded-xs bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
                          {t("common.published")}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-xs bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted">
                          {t("common.draft")}
                        </span>
                      )}
                    </td>

                    <td className="admin-td">
                      <div className="flex items-center gap-4">
                        <Link
                          href={`/${locale}/admin/e-brochures/${brochure.id}/edit`}
                          className="inline-flex items-center gap-1.5 text-sm text-accent-700 hover:text-accent-800"
                        >
                          <Pencil size={14} aria-hidden />
                          {t("common.edit")}
                        </Link>

                        {brochure.isPublished && (
                          <Link
                            href={`/${locale}/e-brochure/${brochure.slug}`}
                            target="_blank"
                            className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
                          >
                            <ExternalLink size={14} aria-hidden />
                            {t("eBrochures.viewLive")}
                          </Link>
                        )}
                      </div>
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
