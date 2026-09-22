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
import { useState, useTransition } from "react";
import { Bell, Check, ChevronDown, Search } from "lucide-react";
import { adminLocales, type Locale } from "@/i18n";
import type { AdminNavCounts } from "@/lib/admin-nav-counts";
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

  const pathnameWithoutLocale = pathname.replace(
    new RegExp(`^/${locale}(/|$)`),
    (_, slash) => slash ?? "/",
  );
  const localizedPath = (target: Locale) =>
    `/${target}${pathnameWithoutLocale === "/" ? "" : pathnameWithoutLocale}`;

  const searchPlaceholder = pathnameWithoutLocale === "/admin/leads" ? labels.searchLeads : labels.search;

  return (
    // px-8 matches the content gutter below it (see the admin layout), so
    // the search box lines up with the page title rather than sitting 8px
    // to its left.
    <div className="sticky top-0 z-30 hidden h-14 items-center gap-4 border-b border-primary/10 bg-white px-8 lg:flex">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("admin:open-search"))}
        className="flex h-[34px] max-w-sm flex-1 items-center gap-2 rounded-xs border border-primary/15 bg-surface px-3 text-xs text-ink-muted transition-colors hover:border-primary/25"
      >
        <Search size={14} aria-hidden className="shrink-0" />
        <span className="flex-1 text-left">{searchPlaceholder}</span>
        <kbd className="rounded-xs border border-primary/15 bg-white px-1 py-0.5 text-[9px]">⌘K</kbd>
      </button>

      <div className="flex-1" />

      <span className="text-xs text-ink-muted">{asOfLabel}</span>

      <span className="h-[22px] w-px bg-primary/10" aria-hidden />

      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={bellOpen}
          aria-label={labels.notifications}
          onClick={() => setBellOpen((open) => !open)}
          className="relative flex h-8 w-8 items-center justify-center rounded-xs text-ink-muted transition-colors hover:bg-surface-muted hover:text-primary"
        >
          <Bell size={17} aria-hidden />
          {unreadCount > 0 && (
            <span
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full border border-white bg-red-600"
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
              className="absolute right-0 z-50 mt-2 w-80 rounded-xs border border-primary/10 bg-white py-1 shadow-lg"
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
          className="flex items-center gap-1 text-xs font-medium text-ink-muted transition-colors hover:text-primary"
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
