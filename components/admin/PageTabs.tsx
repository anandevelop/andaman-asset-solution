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
import { usePathname, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Role } from "@prisma/client";
import { tabBase, visibleTabs } from "@/lib/admin/nav";

export default function PageTabs({
  locale,
  role,
  groupKey,
  baseHref,
  badges,
  carryParams,
}: {
  locale: string;
  role: Role;
  /** A sidebar item key ("pages") or a NAV_TAB_GROUPS key ("pagesHome"). */
  groupKey: string;
  /**
   * The workspace's own path under /admin, e.g. "/pages/home".
   *
   * Only needed for a strip that is not a sidebar item's own — pagesHome
   * and pagesAbout, which live inside a page that knows its own path.
   * For everything else the config answers it (NavItem.tabsBase), so this
   * component and visibleTabRows cannot point one tab at two addresses,
   * which they did: the palette offered /admin/leads/appointments.
   */
  baseHref?: string;
  /** Live counts by tab key. Zero and undefined both render nothing: an
   *  empty queue is not news, same rule as the sidebar's own badges. */
  badges?: Partial<Record<string, number>>;
  /**
   * Query parameters to carry across when switching tab.
   *
   * For strips whose tabs are two views of one filtered set — Leads and
   * its appointment calendar share `project` and `assignedTo` — so that
   * narrowing to one project and then changing tab does not silently drop
   * the filter and show the whole company's week. Deliberately an
   * allow-list rather than "keep the whole query string": `?week=` means
   * nothing on the leads table and `?view=board` means nothing on the
   * calendar, and carrying them over would leave junk in the URL that the
   * next reader cannot account for.
   */
  carryParams?: readonly string[];
}) {
  const t = useTranslations("admin.tabs");
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabs = visibleTabs(role, groupKey);
  const base = baseHref ?? tabBase(groupKey) ?? "";

  // One tab is not a choice, and a strip that offers no alternative is
  // furniture. Nothing to draw.
  if (tabs.length < 2) return null;

  const carried = new URLSearchParams();
  for (const key of carryParams ?? []) {
    const value = searchParams.get(key);
    if (value) carried.set(key, value);
  }
  const query = carried.toString();

  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-ink/10" aria-label={t(`${groupKey}.label` as never)}>
      {tabs.map(({ key, segment }) => {
        const href = `/${locale}/admin${base}${segment}`;

        /* Prefix match so a child route keeps its tab lit — the segment ""
           case is exact for the same reason the dashboard is in
           activeItemKey: as a prefix it would match every sibling. */
        const active =
          segment === "" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

        const count = badges?.[key] ?? 0;

        return (
          <Link
            key={key}
            href={query ? `${href}?${query}` : href}
            aria-current={active ? "page" : undefined}
            className={[
              "-mb-px flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm transition-colors",
              active
                ? "border-primary font-semibold text-primary"
                : "border-transparent text-ink-muted hover:text-primary",
            ].join(" ")}
          >
            {t(`${groupKey}.${key}` as never)}
            {count > 0 && (
              <span className="shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
