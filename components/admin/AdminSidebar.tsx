"use client";

/**
 * components/admin/AdminSidebar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sidebar navigation, identity block and sign-out.
 *
 * Client-side because it needs `usePathname()` for the active state, a
 * mobile disclosure, and the desktop collapse toggle below. The user object
 * is passed down from the server layout rather than read via useSession(),
 * so the correct name and role are in the first paint with no loading
 * flicker.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, LogOut, Menu, Search, UserCog, X } from "lucide-react";
import { Role } from "@prisma/client";
import { activeItemKey, visibleNav, type NavItem } from "@/lib/admin/nav";
import { initialsFrom } from "@/lib/format";
import type { AdminNavCounts } from "@/lib/admin-nav-counts";

type Props = {
  locale: string;
  user: { name: string; email: string; role: Role };
  counts: AdminNavCounts;
};

const COLLAPSE_STORAGE_KEY = "admin-sidebar-collapsed";

export default function AdminSidebar({ locale, user, counts }: Props) {
  const t = useTranslations("admin");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Read after mount, not in useState's initializer: the server-rendered
  // markup has no access to localStorage, so starting from it here would
  // make the first client render disagree with the server and trigger a
  // hydration mismatch. A one-frame flash to the stored value is the
  // acceptable trade.
  useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
    if (stored === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const base = `/${locale}/admin`;

  /* One answer for the whole rail rather than a predicate run per link.
     activeItemKey compares every href and keeps the longest match, which
     is what stops "/admin/media" lighting up "Mobile view" — the case the
     hand-written check here used to carry a special case for. */
  const activeKey = activeItemKey(pathname, base);

  const initials = initialsFrom(user.name);

  const renderLink = ({ key, href, icon: Icon, countKey }: NavItem, isCollapsed: boolean) => {
    const active = key === activeKey;
    const label = t(`nav.${key}` as never);
    // Live queue counts (new leads, today's appointments, the review
    // queue) — see lib/admin-nav-counts.ts. Zero renders as no badge at
    // all rather than a "0" pill; an empty queue is not news.
    const count = countKey ? counts[countKey] : 0;

    return (
      <Link
        key={key}
        href={`${base}${href}`}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        title={isCollapsed ? label : undefined}
        className={[
          "flex items-center gap-3 rounded-xs py-2.5 text-sm transition-colors",
          isCollapsed ? "justify-center px-0" : "px-3",
          active
            ? "bg-white/10 font-medium text-white"
            : "text-white/60 hover:bg-white/5 hover:text-white",
        ].join(" ")}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden className="shrink-0" />
        {!isCollapsed && (
          <>
            <span className="flex-1">{label}</span>
            {count > 0 && (
              <span className="ml-auto shrink-0 rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  const renderNav = (isCollapsed: boolean) => {
    /* Structure and filtering both live in lib/admin/nav.ts now: a role
       never sees a link that only lands it on a denied redirect, and a
       group left with no visible items drops its heading too. This
       component draws what it is handed. */
    const groups = visibleNav(user.role);

    return (
      <nav aria-label={t("brand")} className="flex flex-col">
        {groups.map((group, index) => (
          <div key={group.key} className={index > 0 ? "mt-4" : undefined}>
            {index > 0 && isCollapsed && (
              <span className="mx-3 mb-2 block h-px bg-white/10" aria-hidden />
            )}
            {group.labelKey && !isCollapsed && (
              <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/60">
                {t(`navGroups.${group.labelKey}` as never)}
              </p>
            )}
            <div className="flex flex-col gap-0.5">
              {group.items.map((item) => renderLink(item, isCollapsed))}
            </div>
          </div>
        ))}
      </nav>
    );
  };

  /* Mobile drawer only — the desktop rail deliberately has no search, see
     the note where the rail is rendered. There is no collapsed variant for
     the same reason: the drawer is never collapsed. */
  const renderSearchTrigger = () => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        window.dispatchEvent(new Event("admin:open-search"));
      }}
      className="flex items-center gap-2.5 rounded-xs border border-white/10 px-3 py-2 text-xs text-white/50 transition-colors hover:border-white/20 hover:text-white/80"
    >
      <Search size={15} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="flex-1 text-left">{t("search")}</span>
    </button>
  );

  const renderIdentity = (isCollapsed: boolean) => (
    <div className="border-t border-white/10 pt-5">
      {/* The identity block doubles as the link to your own account — the
          first place people look to change their password. */}
      <Link
        href={`${base}/account`}
        onClick={() => setOpen(false)}
        title={isCollapsed ? user.name : undefined}
        className={[
          "flex items-center gap-3 rounded-xs py-1.5 transition-colors hover:bg-white/5",
          isCollapsed ? "justify-center px-0" : "px-1",
        ].join(" ")}
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent"
        >
          {initials || "·"}
        </span>
        {!isCollapsed && (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-white">{user.name}</p>
              <p className="truncate text-xs text-accent">
                {t(`roles.${user.role}` as never)}
              </p>
            </div>
            <UserCog size={15} className="shrink-0 text-white/40" aria-hidden />
          </>
        )}
      </Link>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
        title={isCollapsed ? tAuth("signOut") : undefined}
        className={[
          "mt-4 flex w-full items-center gap-3 rounded-xs py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white",
          isCollapsed ? "justify-center px-0" : "px-3",
        ].join(" ")}
      >
        <LogOut size={17} strokeWidth={1.75} aria-hidden className="shrink-0" />
        {!isCollapsed && tAuth("signOut")}
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile bar */}
      <div className="flex items-center justify-between border-b border-primary/10 bg-primary px-5 py-4 lg:hidden">
        <Link href={base} className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Andaman Asset Solution Co., Ltd."
            width={160}
            height={32}
            className="h-7 w-auto brightness-0 invert"
          />
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className="flex h-9 w-9 items-center justify-center text-white"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="flex flex-col gap-6 bg-primary px-5 pb-6 lg:hidden">
          {renderSearchTrigger()}
          {renderNav(false)}
          {renderIdentity(false)}
        </div>
      )}

      {/* Desktop rail */}
      {/* overflow-y-auto because the rail is exactly one screen tall and the
          content is not. A SUPER_ADMIN sees the full set of grouped links,
          which at a 720px viewport pushes the identity block and its
          sign-out button past the bottom edge — off the dark panel
          entirely, unreachable and, where it landed on the white page
          behind, unreadable at a contrast of 1.03. The collapse toggle
          below narrows the rail but does not shorten it — scrolling stays
          the fallback at short viewports either way. */}
      <aside
        className={[
          "hidden shrink-0 flex-col justify-between overflow-y-auto bg-primary py-8 transition-[width] duration-150 lg:sticky lg:top-0 lg:flex lg:h-screen",
          collapsed ? "w-[76px] px-3" : "w-64 px-5",
        ].join(" ")}
      >
        <div>
          <div className={collapsed ? "flex flex-col items-center gap-3" : "flex items-center justify-between"}>
            <Link href={base} className="block" title={collapsed ? t("brand") : undefined}>
              {collapsed ? (
                <span
                  aria-hidden
                  className="flex h-8 w-8 items-center justify-center rounded-xs bg-white/10 text-sm font-bold text-white"
                >
                  A
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/logo.png"
                  alt="Andaman Asset Solution Co., Ltd."
                  width={160}
                  height={32}
                  className="h-7 w-auto brightness-0 invert"
                />
              )}
            </Link>

            <button
              type="button"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? t("expandSidebar") : t("collapseSidebar")}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              {collapsed ? (
                <ChevronRight size={16} aria-hidden />
              ) : (
                <ChevronLeft size={16} aria-hidden />
              )}
            </button>
          </div>

          {/* No search box here: AdminTopbar already has one directly
              above this rail on every desktop screen, and two identical
              boxes one under the other is just the same control twice.
              The mobile drawer below still renders one, because the topbar
              is lg-only and there would otherwise be no way in but ⌘K —
              which a phone has no keyboard for. */}
          <div className="mt-5">{renderNav(collapsed)}</div>
        </div>

        {renderIdentity(collapsed)}
      </aside>
    </>
  );
}
