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
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Building2,
  CalendarDays,
  HardHat,
  HelpCircle,
  Contact,
  LayoutDashboard,
  LogOut,
  Menu,
  MonitorPlay,
  History,
  Newspaper,
  Settings,
  ShieldCheck,
  Trophy,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { Role } from "@prisma/client";

type Props = {
  locale: string;
  user: { name: string; email: string; role: Role };
};

const NAV = [
  { key: "dashboard", href: "", icon: LayoutDashboard },
  { key: "heroBanner", href: "/hero-banner", icon: MonitorPlay },
  { key: "projects", href: "/projects", icon: Building2 },
  { key: "progress", href: "/progress", icon: HardHat },
  { key: "news", href: "/news", icon: Newspaper },
  { key: "leads", href: "/leads", icon: Users },
  { key: "events", href: "/events", icon: CalendarDays },
  { key: "salesTeam", href: "/sales-team", icon: Contact },
  { key: "awards", href: "/awards", icon: Trophy },
  { key: "faqs", href: "/faqs", icon: HelpCircle },
] as const;

/** Account administration is SUPER_ADMIN-only, matching the page guard. */
const ADMIN_NAV = [
  { key: "settings", href: "/settings", icon: Settings },
  { key: "users", href: "/users", icon: ShieldCheck },
  { key: "activity", href: "/activity", icon: History },
] as const;

export default function AdminSidebar({ locale, user }: Props) {
  const t = useTranslations("admin");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const base = `/${locale}/admin`;

  const isActive = (href: string) => {
    const full = `${base}${href}`;
    // The dashboard would otherwise match every child route.
    return href === "" ? pathname === full : pathname.startsWith(full);
  };

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const link = ({
    key,
    href,
    icon: Icon,
  }: {
    key: string;
    href: string;
    icon: typeof LayoutDashboard;
  }) => {
    const active = isActive(href);
    return (
      <Link
        key={key}
        href={`${base}${href}`}
        onClick={() => setOpen(false)}
        aria-current={active ? "page" : undefined}
        className={[
          "flex items-center gap-3 rounded-sm px-3 py-2.5 text-sm transition-colors",
          active
            ? "bg-white/10 font-medium text-white"
            : "text-white/60 hover:bg-white/5 hover:text-white",
        ].join(" ")}
      >
        <Icon size={17} strokeWidth={1.75} aria-hidden />
        {t(`nav.${key}` as never)}
      </Link>
    );
  };

  const nav = (
    <nav aria-label={t("brand")} className="flex flex-col gap-0.5">
      {NAV.map(link)}

      {user.role === Role.SUPER_ADMIN && (
        <>
          <span className="mx-3 my-2 h-px bg-white/10" aria-hidden />
          {ADMIN_NAV.map(link)}
        </>
      )}
    </nav>
  );

  const identity = (
    <div className="border-t border-white/10 pt-5">
      {/* The identity block doubles as the link to your own account — the
          first place people look to change their password. */}
      <Link
        href={`${base}/account`}
        onClick={() => setOpen(false)}
        className="flex items-center gap-3 rounded-sm px-1 py-1.5 transition-colors hover:bg-white/5"
      >
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent"
        >
          {initials || "·"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{user.name}</p>
          <p className="truncate text-xs text-accent">
            {t(`roles.${user.role}` as never)}
          </p>
        </div>
        <UserCog size={15} className="shrink-0 text-white/40" aria-hidden />
      </Link>

      <button
        type="button"
        onClick={() => signOut({ callbackUrl: `/${locale}/login` })}
        className="mt-4 flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-sm text-white/60 transition-colors hover:bg-white/5 hover:text-white"
      >
        <LogOut size={17} strokeWidth={1.75} aria-hidden />
        {tAuth("signOut")}
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
          {nav}
          {identity}
        </div>
      )}

      {/* Desktop rail */}
      {/* overflow-y-auto because the rail is exactly one screen tall and the
          content is not. A SUPER_ADMIN sees thirteen links, which at a
          720px viewport pushes the identity block and its sign-out button
          past the bottom edge — off the dark panel entirely, unreachable
          and, where it landed on the white page behind, unreadable at a
          contrast of 1.03. Adding the activity link is what tipped it over;
          the next section added would have done the same. */}
      <aside className="hidden w-64 shrink-0 flex-col justify-between overflow-y-auto bg-primary px-5 py-8 lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <Link href={base} className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Andaman Asset Solution Co., Ltd."
              width={160}
              height={32}
              className="h-7 w-auto brightness-0 invert"
            />
          </Link>

          <div className="mt-8">{nav}</div>
        </div>

        {identity}
      </aside>
    </>
  );
}
