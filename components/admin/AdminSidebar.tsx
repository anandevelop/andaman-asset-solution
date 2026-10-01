"use client";

/**
 * components/admin/AdminSidebar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sidebar navigation, identity block and sign-out.
 *
 * Client-side because it needs `usePathname()` for the active state and a
 * mobile disclosure. The user object is passed down from the server layout
 * rather than read via useSession(), so the correct name and role are in
 * the first paint with no loading flicker.
 *
 * The rail is the CI's navy band in both themes — the one surface that
 * never changes, so the back office is recognisably the same product in
 * light and dark. Its collapsed state is not React state: it is the `rail`
 * display pref, an attribute on <html> that the boot script sets before
 * paint, and every collapsed-only style below is the `rail-collapsed:`
 * variant. The topbar's button and the `[` key both flip the same
 * attribute, so there is nothing to keep in sync between them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import { LogOut, Menu, Search, UserCog, X } from "lucide-react";
import { Role } from "@prisma/client";
import { activeItemKey, visibleNav, type NavItem } from "@/lib/admin/nav";
import { initialsFrom } from "@/lib/format";
import type { AdminNavCounts } from "@/lib/admin-nav-counts";
import { toggleRail, useDisplayPref } from "@/lib/admin/use-display-pref";
import { isTypingTarget } from "@/lib/admin/keyboard";

export type AdminEnvironment = {
  kind: "production" | "staging" | "development";
  /** Already translated by the layout. */
  label: string;
  /** The host this back office was reached on, e.g. andamanassetsolution.com. */
  host: string | null;
};

type Props = {
  locale: string;
  user: { name: string; email: string; role: Role };
  counts: AdminNavCounts;
  environment: AdminEnvironment;
};

const ENV_DOT: Record<AdminEnvironment["kind"], string> = {
  production: "bg-emerald-400",
  staging: "bg-amber-400",
  development: "bg-white/40",
};

export default function AdminSidebar({ locale, user, counts, environment }: Props) {
  const t = useTranslations("admin");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rail = useDisplayPref("rail");
  const collapsed = rail === "collapsed";

  // `[` collapses and expands the rail, as in the mockup. Bound here rather
  // than in the topbar because this is the component whose state it is.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "[" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      toggleRail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const base = `/${locale}/admin`;

  /* One answer for the whole rail rather than a predicate run per link.
     activeItemKey compares every href and keeps the longest match, which
     is what stops "/admin/media" lighting up "Mobile view" — the case the
     hand-written check here used to carry a special case for. */
  const activeKey = activeItemKey(pathname, base);

  const initials = initialsFrom(user.name);

  /* `onRail` is the desktop rail, which can collapse; the phone drawer
     never does, so it must not pick up the collapsed styles from a
     preference set on a laptop. */
  const renderLink = ({ key, href, icon: Icon, countKey }: NavItem, onRail: boolean) => {
    const active = key === activeKey;
    const label = t(`nav.${key}` as never);
    // Live queue counts (new leads, the review queue) — see
    // lib/admin-nav-counts.ts. Only items with a countKey carry one, and
    // zero renders as no badge at all: an empty queue is not news.
    const count = countKey ? counts[countKey] : 0;

    return (
      <Link
        key={key}
        href={`${base}${href}`}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        title={onRail && collapsed ? label : undefined}
        className={[
          "relative flex h-9 items-center gap-[11px] rounded-[10px] px-[10px] text-[13px] transition-colors",
          onRail ? "rail-collapsed:justify-center rail-collapsed:px-0" : "",
          active
            ? "bg-linear-to-r from-adm-fill/15 to-transparent font-medium text-white before:absolute before:-left-[10px] before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:bg-adm-fill"
            : "text-white/65 hover:bg-white/5 hover:text-white",
        ].join(" ")}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span className={["flex-1 truncate", onRail ? "rail-collapsed:hidden" : ""].join(" ")}>{label}</span>
        {count > 0 && (
          <>
            <span
              className={[
                "ml-auto min-w-5 shrink-0 rounded-full bg-adm-fill px-[6px] py-[3px] text-center text-[11px] font-semibold leading-none text-adm-on-fill",
                onRail ? "rail-collapsed:hidden" : "",
              ].join(" ")}
            >
              {count > 99 ? "99+" : count}
            </span>
            {/* Collapsed, the number has nowhere to go; a dot still says
                "something is waiting here". */}
            {onRail && (
              <span
                aria-hidden
                className="absolute left-[38px] top-[7px] hidden h-[7px] w-[7px] rounded-full bg-adm-fill rail-collapsed:block"
              />
            )}
          </>
        )}
      </Link>
    );
  };

  const renderNav = (surface: "rail" | "drawer") => {
    /* Structure and filtering both live in lib/admin/nav.ts: a role never
       sees a link that only lands it on a denied redirect, and a zone left
       with no visible items drops its heading too. This component draws
       what it is handed.

       `surface` is the one thing the two copies of this nav disagree
       about: "Mobile view" is a phone layout, so the drawer shows it
       first and the desktop rail does not show it at all. */
    const groups = visibleNav(user.role, surface);
    const onRail = surface === "rail";

    return (
      <nav aria-label={t("brand")} className="flex flex-col">
        {groups.map((group, index) => (
          <div key={group.key} className={index > 0 ? "mt-[14px]" : undefined}>
            {index > 0 && onRail && (
              <span className="mx-[10px] mb-[8px] hidden h-px bg-white/10 rail-collapsed:block" aria-hidden />
            )}
            {group.labelKey && (
              <p
                className={[
                  "mb-[6px] px-[10px] text-[10.5px] font-medium tracking-[0.06em] text-white/60",
                  onRail ? "rail-collapsed:hidden" : "",
                ].join(" ")}
              >
                {t(`navGroups.${group.labelKey}` as never)}
              </p>
            )}
            <div className="flex flex-col gap-[2px]">
              {group.items.map((item) => renderLink(item, onRail))}
            </div>
          </div>
        ))}
      </nav>
    );
  };

  /* Mobile drawer only — on desktop the topbar's search field is directly
     above the rail. */
  const renderSearchTrigger = () => (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        window.dispatchEvent(new Event("admin:open-search"));
      }}
      className="flex items-center gap-2.5 rounded-[10px] border border-white/10 px-3 py-2 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white/80"
    >
      <Search size={15} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="flex-1 text-left">{t("search")}</span>
    </button>
  );

  const renderEnvironment = (onRail: boolean) => (
    <div
      className={[
        "flex items-center gap-2 whitespace-nowrap rounded-[10px] border border-white/10 px-2.5 py-1.5 text-[11.5px] text-white/60",
        onRail ? "mx-3 mt-3 rail-collapsed:hidden" : "",
      ].join(" ")}
    >
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${ENV_DOT[environment.kind]}`} />
      <span className="font-medium text-white">{environment.label}</span>
      {environment.host && (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">{environment.host}</span>
        </>
      )}
    </div>
  );

  const renderIdentity = (onRail: boolean) => (
    <div className="border-t border-white/10 px-[10px] py-[10px]">
      {/* The identity block doubles as the link to your own account — the
          first place people look to change their password. */}
      <Link
        href={`${base}/account`}
        onClick={() => setOpen(false)}
        title={onRail && collapsed ? user.name : undefined}
        className={[
          "flex items-center gap-[10px] rounded-[10px] px-[6px] py-[6px] transition-colors hover:bg-white/5",
          onRail ? "rail-collapsed:justify-center rail-collapsed:px-0" : "",
        ].join(" ")}
      >
        <span
          aria-hidden
          className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-adm-fill text-[11px] font-semibold text-adm-on-fill"
        >
          {initials || "·"}
        </span>
        <div className={["min-w-0 flex-1", onRail ? "rail-collapsed:hidden" : ""].join(" ")}>
          <p className="truncate text-[12.5px] font-medium leading-tight text-white">{user.name}</p>
          <p className="truncate text-[11px] leading-tight text-white/55">
            {t(`roles.${user.role}` as never)}
          </p>
        </div>
        <UserCog
          size={15}
          className={["shrink-0 text-white/40", onRail ? "rail-collapsed:hidden" : ""].join(" ")}
          aria-hidden
        />
      </Link>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
        title={onRail && collapsed ? tAuth("signOut") : undefined}
        aria-label={tAuth("signOut")}
        className={[
          "mt-[4px] flex h-9 w-full items-center gap-[11px] rounded-[10px] px-[10px] text-[13px] text-white/60 transition-colors hover:bg-white/5 hover:text-white",
          onRail ? "rail-collapsed:justify-center rail-collapsed:px-0" : "",
        ].join(" ")}
      >
        <LogOut size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span className={onRail ? "rail-collapsed:hidden" : undefined}>{tAuth("signOut")}</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile bar */}
      <div
        data-admin-sidebar
        className="flex h-[52px] items-center justify-between border-b border-white/10 bg-adm-band px-4 lg:hidden"
      >
        <Link href={base} className="inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-white.png"
            alt="Andaman Asset Solution Co., Ltd."
            width={895}
            height={120}
            className="h-[20px] w-auto"
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
        <div data-admin-sidebar className="flex flex-col gap-5 bg-adm-band px-5 pb-6 lg:hidden">
          {renderEnvironment(false)}
          {renderSearchTrigger()}
          {renderNav("drawer")}
          {renderIdentity(false)}
        </div>
      )}

      {/* Desktop rail */}
      {/* The rail is exactly one screen tall and the content is not. A
          SUPER_ADMIN sees the full set of grouped links, which at a 720px
          viewport used to push the identity block and its sign-out button
          past the bottom edge — off the dark panel entirely and, where it
          landed on the white page behind, unreadable at a contrast of 1.03.
          So only the link list scrolls: the brand bar above it and the
          identity block below are pinned, and sign-out is always on screen. */}
      <aside
        data-admin-sidebar
        className="hidden w-[248px] shrink-0 flex-col overflow-hidden bg-adm-band transition-[width] duration-200 ease-out motion-reduce:transition-none rail-collapsed:w-[68px] lg:sticky lg:top-0 lg:flex lg:h-screen"
      >
        {/* 60px, the topbar's height, so the two hairlines meet in one line. */}
        <div className="flex h-[60px] shrink-0 items-center border-b border-white/10 px-4 rail-collapsed:justify-center rail-collapsed:px-0">
          <Link href={base} title={t("brand")} className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-white.png"
              alt="Andaman Asset Solution Co., Ltd."
              width={895}
              height={120}
              className="h-[20px] w-auto rail-collapsed:hidden"
            />
            {/* The mark alone, when there is no room for the wordmark. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon-192.png"
              alt=""
              aria-hidden
              width={192}
              height={192}
              className="hidden h-8 w-8 rounded-[10px] rail-collapsed:block"
            />
          </Link>
        </div>

        {renderEnvironment(true)}

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-[10px] py-[10px] [scrollbar-color:rgba(255,255,255,0.15)_transparent] [scrollbar-width:thin]">
          {renderNav("rail")}
        </div>

        {renderIdentity(true)}
      </aside>
    </>
  );
}
