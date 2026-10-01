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
import { Bell, Check, ChevronDown, Moon, PanelLeftClose, PanelLeftOpen, Rows3, Rows4, Search, Sun } from "lucide-react";
import { adminLocales, type Locale } from "@/i18n";
import type { AdminNavCounts } from "@/lib/admin-nav-counts";
import { ADMIN_NAV, activeItemKey } from "@/lib/admin/nav";
import { applyDisplayPref, restoreDisplayPrefs, toggleRail, useDisplayPref } from "@/lib/admin/use-display-pref";
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
  /** People on the public site right now, or null when this role may not
   *  read analytics — see the layout. */
  liveCount: number | null;
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
  liveCount,
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
  const rail = useDisplayPref("rail");

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

  // Breadcrumb: zone / page, from the same nav table the rail draws, so a
  // page renamed in nav.ts is renamed here too. A page no item owns (the
  // account screen) falls back to the back office's own name.
  const activeKey = activeItemKey(pathname, `/${locale}/admin`);
  const activeGroup = ADMIN_NAV.find((group) => group.items.some((item) => item.key === activeKey));
  const zone = activeGroup?.labelKey ? t(`navGroups.${activeGroup.labelKey}` as never) : t("brand");
  const page = activeKey ? t(`nav.${activeKey}` as never) : null;

  const searchPlaceholder =
    pathnameWithoutLocale === "/admin/leads" ? labels.searchLeads : t("topbar.searchOrCommand");

  const iconButton =
    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-ink-muted transition-colors hover:bg-primary/5 hover:text-ink";

  return (
    <div className="sticky top-0 z-30 hidden h-[60px] items-center gap-3 border-b border-adm-line bg-adm-bg/85 px-5 backdrop-blur-md lg:flex">
      <button
        type="button"
        onClick={toggleRail}
        aria-pressed={rail === "collapsed"}
        aria-label={rail === "collapsed" ? t("expandSidebar") : t("collapseSidebar")}
        title={`${rail === "collapsed" ? t("expandSidebar") : t("collapseSidebar")} ( [ )`}
        className={iconButton}
      >
        {rail === "collapsed" ? <PanelLeftOpen size={18} aria-hidden /> : <PanelLeftClose size={18} aria-hidden />}
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 shrink items-center gap-2 text-[13px] text-ink-muted">
        {page ? (
          <>
            <span className="shrink-0">{zone}</span>
            <span aria-hidden className="opacity-50">/</span>
            <span aria-current="page" className="truncate font-medium text-ink">
              {page}
            </span>
          </>
        ) : (
          <Link href={`/${locale}/admin`} className="truncate font-medium text-ink transition-colors hover:text-primary">
            {zone}
          </Link>
        )}
      </nav>

      {/* Centred in the space left over, not in the bar: the breadcrumb and
          the right-hand cluster are different widths on every page, and a
          field that moved with them would never be where the eye expects. */}
      <div className="flex min-w-0 flex-1 justify-center px-2">
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("admin:open-search"))}
          className="flex h-[38px] w-full max-w-[560px] items-center gap-2.5 rounded-[12px] border border-adm-line bg-adm-panel pl-3.5 pr-2 text-[13px] text-ink-muted transition-colors hover:border-adm-line-strong"
        >
          <Search size={16} aria-hidden className="shrink-0" />
          <span className="flex-1 truncate text-left">{searchPlaceholder}</span>
          <kbd className="rounded-[6px] border border-adm-line-strong px-1.5 py-0.5 font-mono text-[10.5px] leading-none">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* null when this role cannot read analytics — the layout asks the
          nav config, so the pill and the Analytics link share one rule. */}
      {liveCount !== null && (
        <Link
          href={`/${locale}/admin/analytics`}
          title={asOfLabel}
          className="flex h-[30px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-adm-success/30 bg-adm-success-bg px-3 text-[12px] text-adm-success transition-colors hover:border-adm-success/60"
        >
          <span aria-hidden className="relative flex h-2 w-2">
            {liveCount > 0 && (
              <span className="absolute inset-0 rounded-full bg-adm-success opacity-60 motion-safe:animate-ping" />
            )}
            <span className="relative h-2 w-2 rounded-full bg-adm-success" />
          </span>
          {t("topbar.liveVisitors", { count: liveCount })}
        </Link>
      )}

      <span className="hidden whitespace-nowrap text-[11px] text-ink-muted 2xl:inline">{asOfLabel}</span>

      <span className="h-5 w-px shrink-0 bg-adm-line" aria-hidden />

      <button
        type="button"
        onClick={() => applyDisplayPref("density", density === "compact" ? "comfortable" : "compact")}
        aria-pressed={density === "comfortable"}
        title={density === "compact" ? t("topbar.densityComfortable") : t("topbar.densityCompact")}
        aria-label={t("topbar.density")}
        className={iconButton}
      >
        {density === "compact" ? <Rows4 size={17} aria-hidden /> : <Rows3 size={17} aria-hidden />}
      </button>

      <button
        type="button"
        onClick={() => applyDisplayPref("theme", theme === "light" ? "dark" : "light")}
        aria-pressed={theme === "dark"}
        title={theme === "light" ? t("topbar.themeDark") : t("topbar.themeLight")}
        aria-label={t("topbar.theme")}
        className={iconButton}
      >
        {theme === "light" ? <Moon size={17} aria-hidden /> : <Sun size={17} aria-hidden />}
      </button>

      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={bellOpen}
          aria-label={labels.notifications}
          onClick={() => setBellOpen((open) => !open)}
          className={iconButton}
        >
          <Bell size={17} aria-hidden />
          {unreadCount > 0 && (
            <span
              className="absolute right-2 top-2 h-[7px] w-[7px] rounded-full bg-adm-danger ring-2 ring-adm-bg"
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
              className="absolute right-0 z-50 mt-2 w-[360px] overflow-hidden rounded-[12px] border border-adm-line bg-adm-solid py-1 shadow-[var(--adm-shadow-float)]"
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
          className="flex h-9 items-center gap-1 rounded-[10px] px-2 text-[11px] font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-primary"
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
              className="absolute right-0 top-full z-20 mt-2 min-w-40 overflow-hidden rounded-[12px] border border-adm-line bg-adm-solid py-1 shadow-[var(--adm-shadow-float)]"
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
