/**
 * components/admin/mobile/MobileShell.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Shared chrome for every /admin/m screen: a dark app-bar (matching
 * Mobile.dc.html's ".ab") plus the bottom tab bar, wrapped to a phone-ish
 * column width. This still renders inside the normal admin layout (the
 * persistent sidebar/top bar in app/[locale]/admin/layout.tsx) rather than
 * escaping it — restructuring the route tree to get a true full-screen
 * kiosk shell was not worth it for a feature whose whole audience is a
 * phone-width viewport, where the sidebar already collapses to a slim top
 * bar. The trade is one extra top bar on a phone; the gain is not fighting
 * the parent layout.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import MobileTabBar, { type MobileTab } from "./MobileTabBar";

type Props = {
  locale: string;
  active: MobileTab;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  backHref?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
};

export default function MobileShell({
  locale,
  active,
  eyebrow,
  title,
  subtitle,
  backHref,
  headerRight,
  children,
}: Props) {
  return (
    <div className="mx-auto flex max-w-md flex-col">
      <header className="flex items-center gap-3 rounded-xs bg-primary px-4 py-4 text-white">
        {backHref && (
          <Link
            href={backHref}
            aria-label={locale === "th" ? "ย้อนกลับ" : "Back"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <ChevronLeft size={20} aria-hidden />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-accent-400">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-0.5 truncate text-lg font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 truncate text-xs text-white/70">{subtitle}</p>}
        </div>
        {headerRight}
      </header>

      <div className="flex-1 space-y-3 py-4">{children}</div>

      <MobileTabBar locale={locale} active={active} />
    </div>
  );
}
