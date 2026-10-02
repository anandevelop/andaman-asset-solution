"use client";

/**
 * components/admin/AdminSidebar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Sidebar navigation, environment chip and the account menu.
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
import { useTranslations } from "next-intl";
import { Menu, Search, X } from "lucide-react";
import { Role } from "@prisma/client";
import { activeItemKey, visibleNav, type NavItem } from "@/lib/admin/nav";
import AccountMenu from "@/components/admin/AccountMenu";
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
  user: { id: string; name: string; email: string; role: Role };
  counts: AdminNavCounts;
  environment: AdminEnvironment;
};

const ENV_DOT: Record<AdminEnvironment["kind"], string> = {
  production: "bg-adm-live",
  staging: "bg-adm-warning",
  development: "bg-adm-rail-dim",
};

export default function AdminSidebar({ locale, user, counts, environment }: Props) {
  const t = useTranslations("admin");
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
            ? "bg-linear-to-r from-adm-rail-active to-transparent font-medium text-adm-rail-hi before:absolute before:-left-[10px] before:top-2 before:bottom-2 before:w-[3px] before:rounded-r-[3px] before:bg-adm-fill before:shadow-[0_0_12px_var(--adm-rail-glow)]"
            : "text-adm-rail-text hover:bg-adm-rail-hover hover:text-adm-rail-hi",
        ].join(" ")}
      >
        <Icon size={18} strokeWidth={1.75} aria-hidden className="shrink-0" />
        <span className={["flex-1 truncate", onRail ? "rail-collapsed:hidden" : ""].join(" ")}>{label}</span>
        {count > 0 && (
          <>
            <span
              className={[
                "ml-auto flex h-[18px] min-w-5 shrink-0 items-center justify-center rounded-[9px] bg-adm-fill px-[6px] text-[11px] font-semibold leading-none text-adm-on-fill",
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
                className="absolute left-[30px] top-[7px] hidden h-[7px] w-[7px] rounded-full bg-adm-fill rail-collapsed:block"
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
              <span className="mx-[10px] mb-[8px] hidden h-px bg-adm-rail-line rail-collapsed:block" aria-hidden />
            )}
            {group.labelKey && (
              <p
                className={[
                  // rail-text, not the mockup's dimmer #6B8596: that is 3.3:1 on
                  // the navy at 10.5px, under the 4.5:1 the a11y spec holds
                  // every admin screen to.
                  "mx-[10px] mb-[6px] text-[10.5px] font-medium tracking-[0.06em] text-adm-rail-text",
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
      className="flex items-center gap-2.5 rounded-[10px] border border-adm-rail-line px-3 py-2 text-xs text-adm-rail-text transition-colors hover:bg-adm-rail-hover hover:text-adm-rail-hi"
    >
      <Search size={15} strokeWidth={1.75} aria-hidden className="shrink-0" />
      <span className="flex-1 text-left">{t("search")}</span>
    </button>
  );

  const renderEnvironment = (onRail: boolean) => (
    <div
      title={environment.host ?? undefined}
      className={[
        "flex min-w-0 items-center gap-2 whitespace-nowrap rounded-[10px] border border-adm-rail-line px-2.5 py-[7px] text-xs text-adm-rail-text",
        onRail ? "mx-3 mb-2.5 mt-0.5 rail-collapsed:hidden" : "",
      ].join(" ")}
    >
      <span aria-hidden className="relative flex h-1.5 w-1.5 shrink-0">
        {environment.kind === "production" && (
          <span className="absolute inset-0 rounded-full bg-adm-live opacity-70 motion-safe:animate-ping" />
        )}
        <span className={`relative h-1.5 w-1.5 rounded-full ${ENV_DOT[environment.kind]}`} />
      </span>
      <span className="truncate">
        {environment.label}
        {environment.host && (
          <>
            {" · "}
            <span className="font-medium text-adm-rail-hi">{environment.host}</span>
          </>
        )}
      </span>
    </div>
  );

  /* The footer is the account menu — account, density, language, sign
     out. Sign-out used to be a row of its own here; the v4 rail has none,
     and settings about you sit behind your name (AccountMenu.tsx). */
  const renderIdentity = (onRail: boolean) => (
    <div className="border-t border-adm-rail-line p-2.5">
      <AccountMenu
        locale={locale}
        user={user}
        compactCapable={onRail}
        onNavigate={() => setOpen(false)}
      />
    </div>
  );

  return (
    <>
      {/* Mobile bar */}
      <div
        data-admin-sidebar
        className="flex h-[52px] items-center justify-between border-b border-adm-rail-line bg-adm-band px-4 lg:hidden"
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
        className="hidden w-[248px] shrink-0 flex-col overflow-hidden border-r border-adm-rail-edge bg-adm-band transition-[width] duration-[280ms] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none rail-collapsed:w-[68px] lg:sticky lg:top-0 lg:flex lg:h-screen"
      >
        {/* 60px, the topbar's height, so the two hairlines meet in one line.
            The mark is drawn, not the 192px app icon: at 34px the icon's
            own padding made it read as a smaller square than the mockup's. */}
        <div className="flex h-[60px] shrink-0 items-center px-4 rail-collapsed:justify-center rail-collapsed:px-0">
          <Link href={base} title={t("brand")} className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-linear-to-br from-adm-fill-2 to-adm-fill text-[15px] font-bold text-adm-band"
            >
              A
            </span>
            <span className="min-w-0 rail-collapsed:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-white.png"
                alt="Andaman Asset Solution Co., Ltd."
                width={895}
                height={120}
                className="block h-[13px] w-auto"
              />
              <span className="mt-1 block text-[10.5px] tracking-[0.08em] text-adm-rail-text">
                {t("backOffice")}
              </span>
            </span>
          </Link>
        </div>

        {renderEnvironment(true)}

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-[10px] py-[10px] [scrollbar-color:var(--adm-rail-line)_transparent] [scrollbar-width:thin]">
          {renderNav("rail")}
        </div>

        {renderIdentity(true)}
      </aside>
    </>
  );
}
