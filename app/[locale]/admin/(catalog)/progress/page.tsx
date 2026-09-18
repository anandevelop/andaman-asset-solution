/**
 * app/[locale]/admin/progress/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Project picker for the progress manager. Progress is always scoped to a
 * project, so the sidebar link needs somewhere to land.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight } from "lucide-react";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { formatMonthYear } from "@/lib/format";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminProgressIndexPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  // A picker with nothing to write — every row is a Link to the per-project
  // editor, which carries its own guard.
  await requireAdmin(locale, Role.VIEWER);

  const t = await getTranslations({ locale, namespace: "admin" });

  const projects = await safeQuery(
    "admin:progressIndex",
    () =>
      prisma.project.findMany({
        where: { deletedAt: null },
        orderBy: [{ sortOrder: "asc" }, { nameEn: "asc" }],
        select: {
          id: true,
          nameEn: true,
          nameTh: true,
          location: true,
          _count: { select: { progressUpdates: true } },
          progressUpdates: {
            orderBy: [{ year: "desc" }, { month: "desc" }],
            take: 1,
            select: { year: true, month: true },
          },
        },
      }),
    [],
  );

  /*
    safeQuery degrades to [] when Postgres is unreachable, which renders as
    "no projects yet" — indistinguishable from someone having deleted them.
    Every other admin list page says which it is; this one did not, so an
    outage read as data loss to whoever was editing at the time.
  */
  const offline = isDatabaseOffline();

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("brand")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("progress.title")}
        </h1>
      </header>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {projects.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("projects.empty")}
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((project) => {
            const latest = project.progressUpdates[0];

            return (
              <li key={project.id}>
                <Link
                  href={`/${locale}/admin/progress/${project.id}`}
                  className="admin-card flex items-center justify-between gap-4 transition-shadow hover:shadow-cardHover"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-primary">
                      {locale === "th" ? project.nameTh : project.nameEn}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted">{project.location}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-4 text-sm text-ink-muted">
                    <span>
                      {t("progress.imageCount", {
                        count: project._count.progressUpdates,
                      })}
                    </span>
                    {latest && (
                      <span className="hidden sm:inline">
                        {formatMonthYear(locale, latest.year, latest.month)}
                      </span>
                    )}
                    <ChevronRight size={16} aria-hidden />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
