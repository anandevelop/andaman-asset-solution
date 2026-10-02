/**
 * components/admin/ui/AdminTabs.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The tab row under a page header — the mockup's `.tabs`: 13px muted
 * labels, a 2px sand bar under the active one inset 10px, an optional
 * muted count after the label ("รายชื่อผู้สนใจ 4"). Links, not buttons:
 * every tab is a real route.
 *
 * PageTabs (nav-config strips) and ProjectHubTabs both draw through this,
 * so the two kinds of tab row cannot drift apart again.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";

export type AdminTab = {
  key: string;
  href: string;
  label: string;
  active: boolean;
  /** Muted figure after the label. Omitted when undefined. */
  count?: number;
  /** A sand badge — for counts somebody should act on, like the sidebar's. */
  badge?: number;
};

export default function AdminTabs({
  tabs,
  label,
  className = "",
  trailing,
}: {
  tabs: AdminTab[];
  label: string;
  className?: string;
  /** Right-aligned extra in the row ("view page"). */
  trailing?: React.ReactNode;
}) {
  return (
    <nav
      aria-label={label}
      className={`mb-5 flex items-center gap-0.5 overflow-x-auto border-b border-adm-line ${className}`}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={tab.active ? "page" : undefined}
          className={[
            "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-[13px] transition-colors",
            tab.active
              ? "text-adm-text after:absolute after:inset-x-2.5 after:bottom-0 after:h-[2px] after:rounded-[2px] after:bg-adm-fill"
              : "text-adm-muted hover:text-adm-text",
          ].join(" ")}
        >
          {tab.label}
          {tab.count !== undefined && <span className="text-[11px] text-adm-muted/70 tabular-nums">{tab.count}</span>}
          {tab.badge !== undefined && tab.badge > 0 && (
            <span className="rounded-full bg-adm-fill px-1.5 py-0.5 text-[10px] font-semibold leading-none text-adm-on-fill">
              {tab.badge > 99 ? "99+" : tab.badge}
            </span>
          )}
        </Link>
      ))}
      {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
    </nav>
  );
}
