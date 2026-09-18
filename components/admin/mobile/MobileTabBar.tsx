/**
 * components/admin/mobile/MobileTabBar.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The bottom tab bar every /admin/m screen shares (Mobile.dc.html's ".tb").
 * A server component, not a client one — each page already knows which
 * tab it represents (there is no client-side pathname matching to do),
 * so this stays a plain async server component and asks next-intl for
 * its own labels rather than making every page thread them through.
 *
 * "Calendar" deep-links to the existing /admin/appointments week-agenda
 * rather than duplicating it here — see lib/appointments.ts's own note on
 * why that page is already a deliberately simple day-by-day agenda; a
 * second, smaller calendar just for mobile would be a second thing to
 * keep in sync with the first.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarDays, CheckSquare, Home as HomeIcon, Users } from "lucide-react";

export type MobileTab = "today" | "leads" | "calendar" | "units";

type Props = { locale: string; active: MobileTab };

export default async function MobileTabBar({ locale, active }: Props) {
  const t = await getTranslations({ locale, namespace: "admin.mobile" });
  const base = `/${locale}/admin`;

  const tabs = [
    { key: "today" as const, href: `${base}/m`, icon: CheckSquare, label: t("tabs.today") },
    { key: "leads" as const, href: `${base}/m/leads`, icon: Users, label: t("tabs.leads") },
    { key: "calendar" as const, href: `${base}/appointments`, icon: CalendarDays, label: t("tabs.calendar") },
    { key: "units" as const, href: `${base}/m/units`, icon: HomeIcon, label: t("tabs.units") },
  ];

  return (
    <nav className="sticky bottom-0 z-10 flex border-t border-primary/10 bg-white pb-[max(env(safe-area-inset-bottom),8px)]">
      {tabs.map(({ key, href, icon: Icon, label }) => {
        const isTabActive = key === active;
        return (
          <Link
            key={key}
            href={href}
            aria-current={isTabActive ? "page" : undefined}
            className={[
              "flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 pt-2 text-[10.5px]",
              isTabActive ? "font-semibold text-primary" : "text-ink-muted",
            ].join(" ")}
          >
            <Icon size={20} strokeWidth={1.7} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
