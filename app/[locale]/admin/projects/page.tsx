/**
 * app/[locale]/admin/projects/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Project index with bulk publish/unpublish.
 *
 * Soft-deleted rows are excluded — they still exist for the benefit of old
 * URLs and lead attribution, but they are not editable here.
 *
 * The table itself is a client component so selection state can live in
 * one place. Everything it renders is prepared here: dates formatted,
 * enums translated, rows serialised. It receives display strings, not
 * Prisma models — Decimal and Date do not cross that boundary.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import { getTranslation } from "@/lib/get-translation";
import ProjectBulkActions, {
  type ProjectRow,
} from "@/components/admin/ProjectBulkActions";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminProjectsPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  await requireAdmin(locale);

  const [t, tEnum] = await Promise.all([
    getTranslations({ locale, namespace: "admin" }),
    getTranslations({ locale, namespace: "projects" }),
  ]);

  const projects = await safeQuery(
    "admin:projects",
    () =>
      (prisma as any).project.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameTh: true,
          translations: true,
          location: true,
          propertyType: true,
          status: true,
          isPublished: true,
          updatedAt: true,
          _count: { select: { progressUpdates: true } },
        },
      }),
    [] as any[],
  );

  const offline = isDatabaseOffline();

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const rows: ProjectRow[] = projects.map((project: any) => ({
    id: project.id,
    slug: project.slug,
    name:
      getTranslation<any>(project.translations, locale)?.name ??
      (locale === "th" ? project.nameTh : project.nameEn),
    location: project.location,
    propertyTypeLabel: tEnum(`propertyType.${project.propertyType}` as never),
    statusLabel: tEnum(`status.${project.status}` as never),
    isPublished: project.isPublished,
    updatedAt: dateFormat.format(project.updatedAt),
    progressCount: project._count.progressUpdates,
  }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("brand")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
            {t("projects.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("projects.subtitle")}</p>
        </div>

        <Link href={`/${locale}/admin/projects/new`} className="admin-btn">
          <Plus size={16} aria-hidden />
          {t("projects.new")}
        </Link>
      </header>

      {offline && (
        <p className="rounded-sm border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("projects.empty")}
        </div>
      ) : (
        <ProjectBulkActions
          locale={locale}
          rows={rows}
          labels={{
            name: t("projects.name"),
            propertyType: t("projects.propertyType"),
            status: t("projects.status"),
            published: t("common.published"),
            draft: t("common.draft"),
            updated: t("projects.updated"),
            edit: t("common.edit"),
            selectAll: t("projects.bulk.selectAll"),
            selectRow: t("projects.bulk.selectRow"),
            publish: t("projects.bulk.publish"),
            unpublish: t("projects.bulk.unpublish"),
            clear: t("projects.bulk.clear"),
            error: t("common.error"),
            done: t("projects.bulk.done"),
          }}
        />
      )}
    </div>
  );
}
