/**
 * app/[locale]/admin/(catalog)/projects/[id]/brochures/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * This project's e-brochures.
 *
 * EBrochure has carried a projectId since it was built, so a brochure has
 * always belonged to a project — but the only way to see a project's
 * brochures was to open the whole cross-project list at /admin/e-brochures
 * and read the project column. Nothing in the project workspace mentioned
 * that brochures existed.
 *
 * A list and a "new" button, and nothing else: editing a brochure is
 * several screens of form and four locales of copy, all of which already
 * works at /admin/e-brochures/[id]/edit. Re-implementing it here would be
 * a second copy of the hardest form in this section. The "new" link
 * prefills ?projectId= so the common case — "add a brochure for the
 * project I am looking at" — does not ask you to find it again in a
 * dropdown.
 *
 * VIEWER may read, EDITOR may create: the same split the cross-project
 * list uses, and the destination pages re-check regardless.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ExternalLink, Pencil, Plus } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { translationCompleteness } from "@/lib/admin/translated-form";
import ProjectHubTabs from "@/components/admin/ProjectHubTabs";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string; id: string }> };

type Row = {
  id: string;
  slug: string;
  isPublished: boolean;
  sortOrder: number;
  translations: { locale: string; title: string }[];
};

export default async function AdminProjectBrochuresPage(props: Props) {
  const { locale, id: projectId } = await props.params;

  const session = await requireAdmin(locale, Role.VIEWER);
  const canWrite = hasRole(session.role, Role.EDITOR);

  const t = await getTranslations({ locale, namespace: "admin" });

  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, nameEn: true, nameTh: true },
  });
  if (!project) notFound();

  const brochures = await safeQuery(
    "admin:project-brochures",
    () =>
      prisma.eBrochure.findMany({
        where: { projectId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          slug: true,
          isPublished: true,
          sortOrder: true,
          translations: { select: { locale: true, title: true } },
        },
      }) as unknown as Promise<Row[]>,
    [] as Row[],
  );

  /* safeQuery degrades to [] when Postgres is unreachable, which renders
     as "no brochures yet" — indistinguishable from there being none
     unless the page says which it is. Same note as the cross-project
     list. */
  const offline = isDatabaseOffline();


  return (
    <div className="space-y-8">
      <ProjectHubTabs locale={locale} projectId={project.id} active="brochures" />

      {offline && (
        <p className="rounded-xs border border-adm-warning/30 bg-adm-warning-bg px-4 py-3 text-sm text-adm-warning">
          {t("common.offline")}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-adm-muted">{t("eBrochures.subtitle")}</p>

        {canWrite && (
          <Link
            href={`/${locale}/admin/e-brochures/new?projectId=${project.id}`}
            className="admin-btn"
          >
            <Plus size={16} aria-hidden />
            {t("eBrochures.new")}
          </Link>
        )}
      </div>

      {brochures.length === 0 ? (
        <div className="admin-card text-center text-sm text-adm-muted">
          {t("eBrochures.emptyForProject")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-card border border-adm-line bg-adm-solid">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-adm-line bg-adm-text/4">
              <tr>
                <th className="admin-th">{t("eBrochures.brochureTitle")}</th>
                <th className="admin-th">{t("common.translationComplete")}</th>
                <th className="admin-th">{t("common.published")}</th>
                <th className="admin-th" />
              </tr>
            </thead>
            <tbody>
              {brochures.map((row) => {
                const title =
                  row.translations.find((entry) => entry.locale === locale)?.title ??
                  row.translations[0]?.title ??
                  row.slug;

                return (
                  <tr key={row.id} className="border-b border-adm-line text-sm last:border-b-0">
                    <td className="admin-td font-medium text-adm-text">
                      {title}
                      <span className="ml-2 font-mono text-xs text-adm-muted">/{row.slug}</span>
                    </td>
                    <td className="admin-td">
                      <TranslationStatusBadges
                        completeness={translationCompleteness(row.translations, "title")}
                      />
                    </td>
                    <td className="admin-td">
                      <span
                        className={`rounded-xs px-2 py-1 text-[11px] font-semibold ${
                          row.isPublished
                            ? "bg-adm-success-bg text-adm-success"
                            : "bg-adm-text/4 text-adm-muted"
                        }`}
                      >
                        {row.isPublished ? t("common.published") : t("common.draft")}
                      </span>
                    </td>
                    <td className="admin-td">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/${locale}/admin/e-brochures/${row.id}/edit`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-adm-accent-ink hover:text-adm-accent-ink"
                        >
                          <Pencil size={13} aria-hidden />
                          {t("common.edit")}
                        </Link>
                        {row.isPublished && (
                          <a
                            href={`/${locale}/e-brochures/${row.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-adm-muted hover:text-adm-text"
                          >
                            <ExternalLink size={13} aria-hidden />
                            {t("eBrochures.viewLive")}
                          </a>
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
