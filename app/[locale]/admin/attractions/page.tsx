/**
 * app/[locale]/admin/attractions/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Entry point for Nearby Attraction management — the shared default set,
 * then one link per project. Each link goes to
 * app/[locale]/admin/attractions/[projectId]/page.tsx.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRight, Globe2 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin/guard";

type Props = { params: { locale: string } };

export default async function AdminAttractionsIndexPage({ params: { locale } }: Props) {
  await requireAdmin(locale);

  const t = await getTranslations({ locale, namespace: "admin" });

  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { sortOrder: "asc" },
    select: { id: true, nameEn: true, nameTh: true, slug: true },
  });

  const rowClass =
    "flex items-center justify-between gap-3 border-b border-primary/10 px-5 py-4 text-sm transition-colors last:border-0 hover:bg-primary-900/[0.02]";

  return (
    <div className="space-y-8">
      <header>
        <p className="admin-section-title">{t("attractions.title")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
          {t("attractions.title")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("attractions.indexSubtitle")}</p>
      </header>

      <div className="admin-card p-0">
        <Link href={`/${locale}/admin/attractions/shared`} className={rowClass}>
          <span className="flex items-center gap-2.5 font-medium text-primary">
            <Globe2 size={16} className="text-accent-700" aria-hidden />
            {t("attractions.sharedDefault")}
          </span>
          <ChevronRight size={16} className="text-ink-muted" aria-hidden />
        </Link>

        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/${locale}/admin/attractions/${project.id}`}
            className={rowClass}
          >
            <span className="text-primary">
              {locale === "th" ? project.nameTh : project.nameEn}
            </span>
            <ChevronRight size={16} className="text-ink-muted" aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}
