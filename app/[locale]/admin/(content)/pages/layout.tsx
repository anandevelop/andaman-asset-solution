/**
 * app/[locale]/admin/pages/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The Pages hub — one workspace for the public site's standing pages, in
 * place of the eight sidebar rows that used to edit their sections.
 *
 * Two levels of tabs, and the split is deliberate. This layout draws the
 * page being edited (Home | About | FAQ); each of those draws its own
 * sections below (Sections | Hero | Gallery | Closing CTA). Flattening
 * them into one strip would put "Milestones" beside "Home", which is the
 * category error the whole restructure exists to remove: a section of a
 * page is not a peer of the page.
 *
 * The guard is here rather than repeated in ten page files. Every one of
 * those pages still calls requireAdmin for itself — a layout in the App
 * Router is not a security boundary for the routes beneath it, only a
 * convenience for the chrome — but the role this layout reads to filter
 * the tabs has to come from somewhere, and asking once is cheaper than
 * asking twice.
 *
 * Role.VIEWER, not the requireAdmin() default of EDITOR: since this is a
 * convenience read rather than the security boundary, its minimum should
 * be the loosest one any tab actually needs, and Phase 4 opened every tab
 * here to VIEWER (the surrounding (content)/layout.tsx admits them, and
 * each tab page's own guard does too). Leaving this at the default would
 * have turned VIEWER away from the whole hub before any of that ran —
 * exactly the mismatch tests/admin/permissions-nav.test.ts checks for.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import PageTabs from "@/components/admin/PageTabs";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminPagesLayout({ children, params }: Props) {
  const { locale } = await params;

  const session = await requireAdmin(locale, Role.VIEWER);
  const t = await getTranslations({ locale, namespace: "admin" });

  return (
    <div className="space-y-6">
      <header>
        <p className="admin-section-title">{t("pages.section")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{t("pages.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-muted">{t("pages.subtitle")}</p>
      </header>

      <PageTabs locale={locale} role={session.role} groupKey="pages" baseHref="/pages" />

      {children}
    </div>
  );
}
