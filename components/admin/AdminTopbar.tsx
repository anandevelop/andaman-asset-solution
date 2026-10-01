"use client";

/**
 * components/admin/AdminTopbar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The persistent strip above every admin page's content — search trigger,
 * a freshness timestamp, a notification bell and the locale switcher, the
 * four things Main.dc.html's mockup topbar carries that this admin used to
 * be missing entirely (the search trigger itself already existed inside
 * AdminSidebar; this adds it here too, matching where the mockup puts it,
 * without removing the sidebar's own copy — see AdminSidebar.tsx).
 *
 * The bell now has a real feed behind it: AdminNotification rows written
 * by lib/notifications.ts when a lead arrives, somebody registers for an
 * event, content is submitted for review, or a run of failed sign-ins
 * trips the lock. Each of those is a switch on the notifications tab of
 * /admin/settings, so what appears here is what somebody chose to be told
 * about — nothing is fabricated to fill the list.
 *
 * The queue totals the sidebar shows (new leads, today's appointments, the
 * review queue) are a different question — "what is waiting for you" rather
 * than "what happened" — and stay where they are.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bell, Check, ChevronDown, ChevronRight, Moon, Rows3, Rows4, Search, Sun } from "lucide-react";
import { adminLocales, type Locale } from "@/i18n";
import type { AdminNavCounts } from "@/lib/admin-nav-counts";
import { ADMIN_NAV, activeItemKey } from "@/lib/admin/nav";
import { applyDisplayPref, restoreDisplayPrefs, useDisplayPref } from "@/lib/admin/use-display-pref";
import { markNotificationsRead } from "@/app/[locale]/admin/notifications-actions";

export type TopbarNotification = {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  read: boolean;
  /** Already formatted for this locale by the server that rendered it. */
  when: string;
};

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  th: "ไทย",
  zh: "中文",
  ru: "Русский",
};

type Props = {
  locale: string;
  counts: AdminNavCounts;
  /** Server-rendered "as of" timestamp, already formatted for this locale. */
  asOfLabel: string;
  notifications: TopbarNotification[];
  unreadCount: number;
  labels: {
    search: string;
    notifications: string;
    noNotifications: string;
    markAllRead: string;
    /** Shown only on the leads board/table's own route (LeadBoard.dc.html's
     *  topbar) — the mockup's lead detail page keeps the generic prompt
     *  below, so this is a match on that one exact route, not a prefix. */
    searchLeads: string;
    language: string;
  };
};

export default function AdminTopbar({
  locale,
  counts,
  asOfLabel,
  notifications,
  unreadCount,
  labels,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [langOpen, setLangOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [, startTransition] = useTransition();
  const t = useTranslations("admin");
  const density = useDisplayPref("density");
  const theme = useDisplayPref("theme");

  // The root layout's inline script applied stored choices on the first
  // full load; this picks up any changed in another tab since.
  useEffect(() => {
    restoreDisplayPrefs();
  }, []);

  const pathnameWithoutLocale = pathname.replace(
    new RegExp(`^/${locale}(/|$)`),
    (_, slash) => slash ?? "/",
  );
  const localizedPath = (target: Locale) =>
    `/${target}${pathnameWithoutLocale === "/" ? "" : pathnameWithoutLocale}`;

  // Breadcrumb: group › page, from the same nav table the rail draws, so a
  // page renamed in nav.ts is renamed here too.
  const activeKey = activeItemKey(pathname, `/${locale}/admin`);
  const activeGroup = ADMIN_NAV.find((group) => group.items.some((item) => item.key === activeKey));
  const crumbs = [
    activeGroup?.labelKey ? t(`navGroups.${activeGroup.labelKey}` as never) : null,
    activeKey ? t(`nav.${activeKey}` as never) : null,
  ].filter((crumb): crumb is string => Boolean(crumb));

  const searchPlaceholder = pathnameWithoutLocale === "/admin/leads" ? labels.searchLeads : labels.search;

  return (
    // px-8 matches the content gutter below it (see the admin layout), so
    // the search box lines up with the page title rather than sitting 8px
    // to its left.
    <div className="sticky top-0 z-30 hidden h-[52px] items-center gap-2 border-b border-primary/10 bg-white px-6 lg:flex">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-muted">
        <Link href={`/${locale}/admin`} className="shrink-0 transition-colors hover:text-primary">
          {t("brand")}
        </Link>
        {crumbs.map((crumb, index) => (
          <span key={crumb} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight size={12} aria-hidden className="shrink-0 opacity-60" />
            <span
              className={index === crumbs.length - 1 ? "truncate font-medium text-ink" : "truncate"}
              aria-current={index === crumbs.length - 1 ? "page" : undefined}
            >
              {crumb}
            </span>
          </span>
        ))}
      </nav>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("admin:open-search"))}
        className="flex h-8 w-[280px] shrink items-center gap-2 rounded-[6px] border border-primary/15 bg-surface px-2.5 text-[12px] text-ink-muted transition-colors hover:border-primary/30"
      >
        <Search size={14} aria-hidden className="shrink-0" />
        <span className="flex-1 truncate text-left">{searchPlaceholder}</span>
        <kbd className="rounded-[4px] border border-b-2 border-primary/15 bg-white px-1 py-0.5 font-mono text-[10px] leading-none">
          ⌘K
        </kbd>
      </button>

      <span className="hidden whitespace-nowrap pl-2 text-[11px] text-ink-muted 2xl:inline">{asOfLabel}</span>

      <span className="mx-1 h-5 w-px bg-primary/10" aria-hidden />

      <button
        type="button"
        onClick={() => applyDisplayPref("density", density === "compact" ? "comfortable" : "compact")}
        aria-pressed={density === "comfortable"}
        title={density === "compact" ? t("topbar.densityComfortable") : t("topbar.densityCompact")}
        aria-label={t("topbar.density")}
        className="flex h-8 w-8 items-center justify-center rounded-[6px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-primary"
      >
        {density === "compact" ? <Rows4 size={16} aria-hidden /> : <Rows3 size={16} aria-hidden />}
      </button>

      <button
        type="button"
        onClick={() => applyDisplayPref("theme", theme === "light" ? "dark" : "light")}
        aria-pressed={theme === "dark"}
        title={theme === "light" ? t("topbar.themeDark") : t("topbar.themeLight")}
        aria-label={t("topbar.theme")}
        className="flex h-8 w-8 items-center justify-center rounded-[6px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-primary"
      >
        {theme === "light" ? <Moon size={16} aria-hidden /> : <Sun size={16} aria-hidden />}
      </button>

      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={bellOpen}
          aria-label={labels.notifications}
          onClick={() => setBellOpen((open) => !open)}
          className="relative flex h-8 w-8 items-center justify-center rounded-[6px] text-ink-muted transition-colors hover:bg-surface-muted hover:text-primary"
        >
          <Bell size={16} aria-hidden />
          {unreadCount > 0 && (
            <span
              className="absolute right-[7px] top-[7px] h-[7px] w-[7px] rounded-full bg-red-600 ring-2 ring-white"
              aria-hidden
            />
          )}
        </button>

        {bellOpen && (
          <>
            {/* Click-away layer, the same pattern as the language menu. */}
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setBellOpen(false)}
              className="fixed inset-0 z-40 cursor-default"
            />

            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-[10px] border border-primary/10 bg-white py-1 shadow-[0_24px_60px_-20px_rgba(4,29,44,0.45)]"
            >
              <div className="flex items-center justify-between gap-2 px-3.5 py-2 text-xs">
                <span className="font-semibold text-primary">{labels.notifications}</span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await markNotificationsRead(locale);
                        router.refresh();
                      })
                    }
                    className="text-ink-muted underline hover:text-primary"
                  >
                    {labels.markAllRead}
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-xs text-ink-muted">
                  {labels.noNotifications}
                </p>
              ) : (
                <ul className="max-h-80 overflow-y-auto border-t border-primary/5">
                  {notifications.map((item) => (
                    <li key={item.id}>
                      <Link
                        href={item.href ? `/${locale}${item.href}` : `/${locale}/admin`}
                        onClick={() => setBellOpen(false)}
                        className={[
                          "block px-3.5 py-2.5 transition-colors hover:bg-surface-muted",
                          item.read ? "" : "bg-accent-50/40",
                        ].join(" ")}
                      >
                        <p className="truncate text-xs font-medium text-primary">{item.title}</p>
                        {item.body && (
                          <p className="mt-0.5 truncate text-xs text-ink-muted">{item.body}</p>
                        )}
                        <p className="mt-0.5 text-[11px] text-ink-muted/80">{item.when}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={langOpen}
          onClick={() => setLangOpen((v) => !v)}
          className="flex h-8 items-center gap-1 rounded-[6px] px-2 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-primary"
        >
          {locale.toUpperCase()}
          <ChevronDown size={13} aria-hidden className={langOpen ? "rotate-180 transition-transform" : "transition-transform"} />
        </button>

        {langOpen && (
          <>
            {/* Click-outside catcher — simplest option here, no ref juggling. */}
            <button
              type="button"
              aria-hidden
              tabIndex={-1}
              onClick={() => setLangOpen(false)}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div
              role="listbox"
              aria-label={labels.language}
              className="absolute right-0 top-full z-20 mt-2 min-w-40 overflow-hidden rounded-xs border border-primary/10 bg-white py-1 shadow-card"
            >
              {adminLocales.map((code) => (
                <Link
                  key={code}
                  href={localizedPath(code)}
                  role="option"
                  aria-selected={code === locale}
                  onClick={() => setLangOpen(false)}
                  className={[
                    "flex items-center justify-between gap-3 whitespace-nowrap px-3.5 py-2 text-sm transition-colors hover:bg-primary/5",
                    code === locale ? "font-medium text-primary" : "text-ink-muted",
                  ].join(" ")}
                >
                  {LOCALE_LABELS[code]}
                  {code === locale && <Check size={14} aria-hidden />}
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
