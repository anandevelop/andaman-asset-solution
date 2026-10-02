/**
 * app/[locale]/admin/(growth)/seo/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The SEO hub's header and tab strip.
 *
 * WHAT THIS REPLACED
 *
 * Five screens with four different ways in. The overview was the only one
 * in the sidebar; keywords and links were reachable from two buttons in
 * its header and nowhere else; /seo/urls had no link at all any more,
 * having been moved out of settings without the link that used to point at
 * it moving too; and the sitewide defaults — title template, default OG
 * image, Search Console verification — were a group in the settings
 * drawer, one route tree and one mental model away from every other SEO
 * control. A tab strip makes the set visible, which is the part that was
 * actually missing.
 *
 * Same shape as the Pages and Publishing hubs: the header lives here so
 * each tab starts at its own content, and the tabs come from
 * lib/admin/nav.ts so they filter by the same canSee() the sidebar uses.
 *
 * Role.ADMIN, not the requireAdmin() default: it is what the (growth) zone
 * already floors at and what every tab beneath this asks for on its own.
 * Reading the session here is for the tab filter — the zone layout and
 * each page's own guard are what actually refuse anybody.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import PageTabs from "@/components/admin/PageTabs";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { zoneEyebrow } from "@/lib/admin/nav";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminSeoLayout({ children, params }: Props) {
  const { locale } = await params;

  const session = await requireAdmin(locale, Role.ADMIN);
  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => t(key as never), "seo")}
        title={t("seo.title")}
        description={t("seo.hubSubtitle")}
      />

      <PageTabs locale={locale} role={session.role} groupKey="seo" baseHref="/seo" />

      {children}
    </div>
  );
}
