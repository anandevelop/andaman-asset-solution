/**
 * app/[locale]/admin/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Back-office chrome: persistent sidebar, identity block, sign-out.
 *
 * requireAdmin() runs here as well as in each page. The middleware already
 * redirects anonymous traffic, but a layout guard means a new page added
 * under /admin is protected the moment it is created, even if the author
 * forgets to call the guard themselves.
 *
 * The one thing this guard does NOT enforce is the 2FA enrolment gate. It
 * cannot: the setup page lives under /admin and therefore renders inside
 * this layout, so a layout that redirects a pending account would redirect
 * the very page it is sending them to — a loop with no exit. Enrolment is
 * gated in three places that can tell the difference:
 *
 *   • proxy.ts        — every admin URL except the setup page
 *   • each page's own requireAdmin() — the setup page opts out explicitly
 *   • requireAdminAction() — server actions, which middleware never sees
 *
 * A page added under /admin without its own guard is still unreachable for
 * a pending account, because middleware turns the navigation away first.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { hasRole } from "@/lib/role-rank";
import { getAdminNavCounts } from "@/lib/admin-nav-counts";
import { getNotificationsFor } from "@/lib/notifications";
import { intlLocale } from "@/lib/format";
import { canSeeItem } from "@/lib/admin/nav";
import { countLiveVisits } from "@/lib/analytics/live-visit";
import { safeQuery } from "@/lib/db";
import { isSiteIndexable } from "@/lib/indexing";
import AuthProvider from "@/components/admin/AuthProvider";
import AdminSidebar, { type AdminEnvironment } from "@/components/admin/AdminSidebar";
import AdminTopbar from "@/components/admin/AdminTopbar";
import CommandK from "@/components/admin/CommandK";
import { UndoToaster } from "@/components/admin/UndoToast";
import CopilotPanel from "@/components/admin/CopilotPanel";
import KeyboardShortcuts from "@/components/admin/KeyboardShortcuts";
import SpotlightTracker from "@/components/admin/ui/SpotlightTracker";
import { isCopilotEnabled } from "@/lib/admin/copilot";

export const metadata: Metadata = {
  title: "Back office",
  robots: { index: false, follow: false },
};

// The admin reads live data on every request; nothing here should be
// statically generated or cached between users.
export const dynamic = "force-dynamic";

type Props = {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
};

export default async function AdminLayout(props: Props) {
  const params = await props.params;

  const { locale } = params;

  const { children } = props;

  // VIEWER, not the requireAdmin() default of EDITOR: this layout wraps
  // every admin route, so any minimum stricter than the lowest real role
  // would turn away SALES and VIEWER accounts before their own page or
  // zone layout ever ran — including the Dashboard's own explicit
  // Role.VIEWER guard right below this one, and including the (crm) zone
  // that SALES uses every day. The floor a route actually needs belongs to
  // that route's own guard; this one only has to admit anyone signed in.
  const user = await requireAdmin(locale, Role.VIEWER, {
    allowTwoFactorSetup: true,
  });

  // Live sidebar/topbar queue badges (see lib/admin-nav-counts.ts) — one
  // cheap set of counts per navigation, not per widget.
  //
  // The live-visitors pill is asked of the nav config rather than a role
  // list of its own: it links into /admin/analytics, so it appears for
  // exactly the roles that link does. Through safeQuery because it is a
  // nicety on every page — Postgres blinking must not take the chrome down.
  const [counts, t, feed, liveCount, requestHeaders] = await Promise.all([
    getAdminNavCounts(user.id),
    getTranslations({ locale, namespace: "admin" }),
    // More than the old dropdown's ten: the drawer folds repeats and test
    // rows away, so it needs enough to fill a screen after doing so.
    getNotificationsFor(user.id, 30),
    canSeeItem(user.role, "analytics")
      ? safeQuery("admin.topbar.liveCount", countLiveVisits, 0)
      : Promise.resolve(null),
    headers(),
  ]);

  /* Which deployment this is, under the logo. Production is whatever has
     declared itself indexable (lib/indexing.ts) — the one switch that
     already has to be set on the real site and nowhere else — so a
     production build that has forgotten SITE_INDEXABLE says "staging"
     here, which is the warning it deserves. */
  const environmentKind: AdminEnvironment["kind"] = isSiteIndexable()
    ? "production"
    : process.env.NODE_ENV === "production"
      ? "staging"
      : "development";
  // Off unless ADMIN_COPILOT=1 — and off means not rendered at all: no
  // button, no panel, no `.` shortcut. See lib/admin/copilot.ts.
  const copilot = isCopilotEnabled();

  const environment: AdminEnvironment = {
    kind: environmentKind,
    label: t(`rail.env.${environmentKind}`),
    host: requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host"),
  };

  // Relative times are formatted here rather than in the topbar: it is a
  // client component, and a time rendered there would differ from the one
  // the server sent for the first paint.
  const relative = new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: "auto",
  });
  const whenLabel = (at: Date) => {
    const minutes = Math.round((at.getTime() - Date.now()) / 60_000);
    if (minutes > -60) return relative.format(Math.min(minutes, 0), "minute");
    const hours = Math.round(minutes / 60);
    if (hours > -24) return relative.format(hours, "hour");
    return relative.format(Math.round(hours / 24), "day");
  };

  const asOfLabel = t("topbar.asOf", {
    when: new Intl.DateTimeFormat(intlLocale(locale), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date()),
  });

  return (
    <AuthProvider>
      <CommandK locale={locale} role={user.role} copilotEnabled={copilot} />
      <UndoToaster />
      <KeyboardShortcuts locale={locale} role={user.role} />
      <SpotlightTracker />
      {/* data-admin-root switches on the back office's denser type and
          spacing scale — see "Back-office density" in globals.css. */}
      <div data-admin-root className="min-h-screen bg-surface text-sm text-ink lg:flex">
        {/*
          `display: contents` so this wrapper is invisible to layout — the
          sidebar stays the flex item it has always been — while giving the
          print stylesheet one thing to hide. /admin/reports is printed as
          the report alone, and the chrome around it has several root
          elements (a mobile bar, the rail, the drawer) that would each
          have to be found and marked otherwise. See @media print in
          globals.css.
        */}
        <div data-admin-chrome className="contents">
          <AdminSidebar locale={locale} user={user} counts={counts} environment={environment} />
        </div>

        <div className="flex-1 lg:min-w-0">
          <div data-admin-chrome className="contents">
            <AdminTopbar
              locale={locale}
              counts={counts}
              asOfLabel={asOfLabel}
              liveCount={liveCount}
              copilotEnabled={copilot}
              canClearTestNotifications={hasRole(user.role, Role.ADMIN)}
              notifications={feed.rows.map((row) => ({
                id: row.id,
                event: row.event,
                title: row.title,
                body: row.body,
                href: row.href,
                read: row.readAt !== null,
                when: whenLabel(row.createdAt),
              }))}
              unreadCount={feed.unread}
              labels={{
                search: t("search"),
                searchLeads: t("leads.searchPlaceholder"),
                language: t("topbar.language"),
                notifications: t("topbar.notifications"),
              }}
            />
          </div>

          {/*
            Full width, gutters only — no max-width.

            It used to be max-w-6xl (1152px), which on the 1800px-wide
            screens this back office is actually worked on left roughly
            200px of empty surface down each side and squeezed the tables
            that need the room most: the leads board, the units grid, the
            article list with its two number columns, and every three-column
            settings screen. Admin work here is tables and side-by-side
            panels, not prose, so the reading-width argument for a cap does
            not apply; the components that *are* prose carry their own
            max-w-2xl/3xl and keep it.
          */}
          <div data-admin-page className="w-full min-w-0 px-4 py-5 sm:px-6 lg:px-7 lg:py-6">
            {children}
          </div>
        </div>

        {/* A sibling of the page column, so opening it narrows the page
            rather than covering it. Chrome, like the rail: hidden in print. */}
        {copilot && (
          <div data-admin-chrome className="contents">
            <CopilotPanel locale={locale} />
          </div>
        )}
      </div>
    </AuthProvider>
  );
}
