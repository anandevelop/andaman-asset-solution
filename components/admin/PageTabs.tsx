"use client";

/**
 * components/admin/PageTabs.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The horizontal tab strip inside a workspace — the Pages hub's Home |
 * About | Contact | FAQ, the SEO hub's five screens, Review & publish's
 * two, and Home's own Sections | Hero | Gallery | Closing CTA.
 *
 * Same idea as SettingsNav.tsx next door: every tab is a real route, so the
 * highlighted one is read from the path rather than held in state. Nothing
 * here can disagree with what is on screen.
 *
 * The tabs come from lib/admin/nav.ts, filtered by the same canSee() the
 * sidebar uses, so a role never sees a tab it cannot open.
 *
 * `groupKey` names both the config strip and the i18n group that labels it
 * (admin.tabs.<groupKey>.<tab>), which is why one prop is enough.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { visibleTabs } from "@/lib/admin/nav";

export default function PageTabs({
  locale,
  role,
  groupKey,
  baseHref,
}: {
  locale: string;
  role: Role;
  /** A sidebar item key ("pages") or a NAV_TAB_GROUPS key ("pagesHome"). */
  groupKey: string;
  /** The workspace's own path under /admin, e.g. "/pages/home". */
  baseHref: string;
}) {
  const t = useTranslations("admin.tabs");
  const pathname = usePathname();

  const tabs = visibleTabs(role, groupKey);

  // One tab is not a choice, and a strip that offers no alternative is
  // furniture. Nothing to draw.
  if (tabs.length < 2) return null;

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-ink/10" aria-label={t(`${groupKey}.label` as never)}>
      {tabs.map(({ key, segment }) => {
        const href = `/${locale}/admin${baseHref}${segment}`;

        /* Prefix match so a child route keeps its tab lit — the segment ""
           case is exact for the same reason the dashboard is in
           activeItemKey: as a prefix it would match every sibling. */
        const active =
          segment === "" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors",
              active
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-ink-muted hover:text-primary",
            ].join(" ")}
          >
            {t(`${groupKey}.${key}` as never)}
          </Link>
        );
      })}
    </nav>
  );
}
