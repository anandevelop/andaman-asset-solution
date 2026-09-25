/**
 * app/[locale]/admin/(content)/publishing/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Review & publish — the hub's shared header and tab strip.
 *
 * Two tabs, and they were three menu rows' worth of the same job. The
 * sidebar had "Translations" under SEO, "Publishing and languages" under
 * content, and the dashboard drew a locale-completeness card beside
 * neither: three entry points to "which of this is ready to go live, and
 * in which languages". A person who found one of them had no reason to
 * think the other two existed.
 *
 * Same shape as the Pages hub one folder over: the header lives here so
 * the tabs sit under one title instead of each page restating it, and the
 * guard is a convenience read for the tab filter rather than the security
 * boundary — every page beneath still calls requireAdmin for itself.
 *
 * Role.VIEWER for the same reason as that hub: it must be the loosest
 * minimum any tab needs, or the layout turns people away before the tab
 * they are allowed to open ever runs its own guard. The queue admits
 * VIEWER; the translations tab does not, and says so itself — which is
 * why that tab is ROLE_SETS.EDITOR_UP in lib/admin/nav.ts and a VIEWER
 * never sees it offered.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import PageTabs from "@/components/admin/PageTabs";

type Props = { children: ReactNode; params: Promise<{ locale: string }> };

export default async function AdminPublishingLayout({ children, params }: Props) {
  const { locale } = await params;

  const session = await requireAdmin(locale, Role.VIEWER);
  const t = await getTranslations({ locale, namespace: "admin.publishing" });

  return (
    <div className="space-y-6">
      <header>
        <p className="admin-section-title">{t("eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-muted">{t("subtitle")}</p>
      </header>

      <PageTabs locale={locale} role={session.role} groupKey="publishing" baseHref="/publishing" />

      {children}
    </div>
  );
}
