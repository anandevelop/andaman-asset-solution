/**
 * app/[locale]/admin/pages/about/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The sections of one public page, as a list down the left (PageSideNav)
 * beside the section being edited — a second horizontal strip under the
 * hub's own tabs read as two peer levels. Under the list, the company's
 * headline figures (CompanyProfile, edited on the story tab), since they
 * belong to the whole About page rather than any one section.
 *
 * Role.VIEWER, not the requireAdmin() default of EDITOR — same reasoning
 * as the hub layout one level up: this is a convenience read for the tab
 * strip's role filter, not the security boundary, and its minimum should
 * be the loosest any tab beneath it needs. Left at the default, it turned
 * VIEWER away from every About tab before that tab's own (already-opened)
 * guard ever ran.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import PageSideNav from "@/components/admin/PageSideNav";
import { getCompanyProfile } from "@/lib/company";
import { getPublishedProjects } from "@/lib/projects";
import { getSiteSettings } from "@/lib/settings";
import { COMPANY_FOUNDED_YEAR } from "@/content/company-timeline";
import { ABOUT_STAT_KEYS, countedAboutStats, resolveAboutStats } from "@/lib/about-stats";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminPagesAboutLayout({ children, params }: Props) {
  const { locale } = await params;
  const session = await requireAdmin(locale, Role.VIEWER);
  const t = await getTranslations({ locale, namespace: "admin" });

  const [counts, profile, projects, settings, tStats] = await Promise.all([
    safeQuery(
      "admin:about:counts",
      async () => {
        const [corporate, whyUs, mission, awards, milestones] = await Promise.all([
          prisma.corporateService.count(),
          prisma.whyUsPoint.count(),
          prisma.missionPrinciple.count(),
          prisma.award.count(),
          prisma.milestone.count(),
        ]);
        return { corporate, whyUs, mission, awards, milestones };
      },
      {} as Record<string, number>,
    ),
    getCompanyProfile(locale),
    getPublishedProjects(locale),
    getSiteSettings(),
    getTranslations({ locale, namespace: "about.stats" }),
  ]);

  /*
    What the About page's stat bar shows right now, counted or typed. This
    card used to show CompanyProfile.statTeamMembers and its siblings, which
    nothing on the site reads and no form writes any more. The "300+" it
    displayed could neither be found on the site nor changed. It shows the
    real figures now and links to where they are edited.
  */
  const shown = resolveAboutStats(
    countedAboutStats(locale, projects, profile?.foundedYear ?? null),
    settings.aboutStats,
  );
  const figures = [
    { label: t("aboutHub.founded"), value: String(profile?.foundedYear ?? COMPANY_FOUNDED_YEAR) },
    ...ABOUT_STAT_KEYS.map((key) => ({ label: tStats(key), value: shown[key] })),
  ];

  return (
    <div className="grid items-start gap-5 lg:grid-cols-12">
      <aside className="space-y-4 lg:sticky lg:top-[78px] lg:col-span-3">
        <PageSideNav
          locale={locale}
          role={session.role}
          groupKey="pagesAbout"
          baseHref="/pages/about"
          counts={counts}
        />
        {figures.length > 0 && (
          <section className="admin-card">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-adm-text">{t("aboutHub.figures")}</h2>
              <Link
                href={`/${locale}/admin/pages/about/figures`}
                className="text-[11.5px] text-adm-accent-ink hover:underline"
              >
                {t("pages.aboutFigures.edit")}
              </Link>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              {figures.map((figure) => (
                <div key={figure.label}>
                  <dt className="text-[11.5px] text-adm-muted">{figure.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-adm-text">{figure.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </aside>

      <div className="min-w-0 lg:col-span-9">{children}</div>
    </div>
  );
}
