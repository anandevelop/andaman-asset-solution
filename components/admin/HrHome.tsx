/**
 * components/admin/HrHome.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The back office's front page for human resources: what is waiting in
 * job applications, and the two places to go.
 *
 * Shown instead of the sales dashboard — see the note where
 * app/[locale]/admin/page.tsx returns it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight, BriefcaseBusiness } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";

export default async function HrHome({ locale, name, denied }: { locale: string; name: string; denied: boolean }) {
  const t = await getTranslations({ locale, namespace: "admin" });

  const [unread, inProgress, openPositions] = await safeQuery(
    "admin:hrHome",
    () =>
      Promise.all([
        prisma.jobApplication.count({ where: { viewedAt: null } }),
        prisma.jobApplication.count({ where: { status: { in: ["REVIEWING", "INTERVIEW"] } } }),
        prisma.jobPosition.count({ where: { isOpen: true } }),
      ]),
    [0, 0, 0],
  );

  const base = `/${locale}/admin/careers`;
  const tiles = [
    { label: t("careers.home.unread"), value: unread, href: base },
    { label: t("careers.home.inProgress"), value: inProgress, href: base },
    { label: t("careers.home.openPositions"), value: openPositions, href: `${base}/positions` },
  ];

  return (
    <div className="space-y-6">
      {/* Set by the guards when a page demanded more than this account has. */}
      {denied && (
        <p className="rounded-control border border-adm-danger/30 bg-adm-danger-bg px-4 py-3 text-sm text-adm-danger">
          {t("common.denied")}
        </p>
      )}

      <AdminPageHeader
        eyebrow={{ icon: BriefcaseBusiness, label: t("careers.home.subtitle") }}
        title={t("careers.home.title", { name })}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.label} href={tile.href} className="admin-card block">
            <p className="text-sm text-adm-muted">{tile.label}</p>
            <p className="mt-2 text-3xl font-semibold text-adm-text">{tile.value}</p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={base} className="admin-btn">
          {t("careers.home.viewApplications")}
          <ArrowRight size={15} aria-hidden />
        </Link>
        <Link href={`${base}/positions`} className="admin-btn-ghost">
          {t("careers.home.managePositions")}
        </Link>
      </div>
    </div>
  );
}
