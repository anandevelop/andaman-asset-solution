"use client";

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
import { useEffect, useRef } from "react";
import type { LucideIcon } from "lucide-react";

export type AdminTab = {
  key: string;
  href: string;
  label: string;
  active: boolean;
  /** Muted figure after the label. Omitted when undefined. */
  count?: number;
  /** A sand badge — for counts somebody should act on, like the sidebar's. */
  badge?: number;
  /** Shown before the label in the "pill" variant. */
  icon?: LucideIcon;
};

export default function AdminTabs({
  tabs,
  label,
  className = "",
  trailing,
  variant = "line",
}: {
  tabs: AdminTab[];
  label: string;
  className?: string;
  /** Right-aligned extra in the row ("view page"). */
  trailing?: React.ReactNode;
  /**
   * "line" (default): the underlined row. "pill": the rounded segmented
   * bar with icons that /admin/analytics uses — for a hub whose tabs are
   * the page's main navigation (the SEO centre).
   */
  variant?: "line" | "pill";
}) {
  const bar = useRef<HTMLDivElement>(null);

  // A narrow screen shows only the first few pills: bring the open one into
  // view, or the strip reads as if "ตั้งค่า" were not selected at all.
  useEffect(() => {
    const active = bar.current?.querySelector<HTMLElement>('[aria-current="page"]');
    const box = bar.current;
    if (active && box) box.scrollLeft = active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2;
  }, [variant]);

  if (variant === "pill") {
    return (
      <nav aria-label={label} className={`mb-5 flex min-w-0 items-center gap-3 ${className}`}>
        {/* One row that scrolls sideways when it does not fit: wrapped onto
            two lines, a rounded-full bar turns into a lozenge. */}
        <div ref={bar} className="relative flex w-fit min-w-0 max-w-full gap-0.5 overflow-x-auto rounded-full border border-adm-line bg-adm-solid p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={[
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-[13px] transition-colors",
                  tab.active ? "bg-white font-semibold text-adm-text shadow-xs" : "text-adm-muted hover:text-adm-text",
                ].join(" ")}
              >
                {Icon && <Icon size={15} aria-hidden className={tab.active ? "text-adm-text" : "text-adm-muted"} />}
                {tab.label}
                {tab.count !== undefined && <span className="text-[11px] text-adm-muted/70 tabular-nums">{tab.count}</span>}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span className="rounded-full bg-adm-fill px-1.5 py-0.5 text-[10px] font-semibold leading-none text-adm-on-fill">
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
        {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
      </nav>
    );
  }

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
