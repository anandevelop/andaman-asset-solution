/**
 * app/[locale]/admin/pages/about/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The sections of one public page, as tabs. See the hub layout one level
 * up for why this is a second strip rather than more entries in the first.
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
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import PageTabs from "@/components/admin/PageTabs";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminPagesAboutLayout({ children, params }: Props) {
  const { locale } = await params;
  const session = await requireAdmin(locale, Role.VIEWER);

  return (
    <div className="space-y-6">
      <PageTabs locale={locale} role={session.role} groupKey="pagesAbout" baseHref="/pages/about" />

      {children}
    </div>
  );
}
