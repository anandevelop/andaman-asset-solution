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
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import PageSideNav from "@/components/admin/PageSideNav";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminPagesAboutLayout({ children, params }: Props) {
  const { locale } = await params;
  const session = await requireAdmin(locale, Role.VIEWER);
  const t = await getTranslations({ locale, namespace: "admin" });

  const [counts, profile] = await Promise.all([
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
    safeQuery(
      "admin:about:profile",
      () =>
        prisma.companyProfile.findUnique({
          where: { id: "default" },
          select: { foundedYear: true, statTeamMembers: true, statClientFeedback: true, statProjectsComplete: true },
        }),
      null,
    ),
  ]);

  const figures = profile
    ? [
        { label: t("aboutHub.founded"), value: profile.foundedYear ? String(profile.foundedYear) : "—" },
        { label: t("aboutHub.team"), value: profile.statTeamMembers },
        { label: t("aboutHub.clients"), value: profile.statClientFeedback },
        { label: t("aboutHub.projects"), value: profile.statProjectsComplete },
      ]
    : [];

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
            <h2 className="text-[13px] font-semibold text-adm-text">{t("aboutHub.figures")}</h2>
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
