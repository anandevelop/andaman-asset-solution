/**
 * app/[locale]/admin/m/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "My day" — Mobile.dc.html screen 1. Everything a sales rep needs to see
 * the moment the app opens: leads overdue for a reply, today's viewings,
 * and leads due for a same-day follow-up — three buckets shown in that
 * order (matching the mockup's three example cards) rather than one
 * perfectly time-sorted feed, a deliberate simplification consistent
 * with lib/appointments.ts's own agenda-not-grid choice.
 *
 * Scoped to the caller regardless of role (mine-or-unassigned) — this is
 * a personal work queue, not a management dashboard, so an ADMIN account
 * opening it on their phone sees their own day, not the whole team's.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Navigation, Phone } from "lucide-react";
import { LeadStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isDatabaseOffline, safeQuery } from "@/lib/db";
import { requireCapability } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import { getMyAppointmentsToday } from "@/lib/appointments";
import MobileShell from "@/components/admin/mobile/MobileShell";
import MobileCheckInButton from "@/components/admin/mobile/MobileCheckInButton";
import MobilePostponeButton from "@/components/admin/mobile/MobilePostponeButton";

type Props = { params: Promise<{ locale: string }> };

const OPEN_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING_SCHEDULED",
  "NEGOTIATING",
];

const DAY_MS = 24 * 60 * 60_000;

export default async function MobileTodayPage(props: Props) {
  const { locale } = await props.params;
  const session = await requireCapability(locale, "viewAllLeads");
  const t = await getTranslations({ locale, namespace: "admin.mobile" });
  const tRoot = await getTranslations({ locale, namespace: "admin" });

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfToday = new Date(startOfToday.getTime() + DAY_MS);
  const scope = { OR: [{ assignedToId: session.id }, { assignedToId: null }] };

  const [overdueLeads, dueTodayLeads, todayAppointments, unassignedCount] = await Promise.all([
    safeQuery(
      "mobile:overdueLeads",
      () =>
        prisma.leadInquiry.findMany({
          where: { ...scope, status: { in: OPEN_STATUSES }, followUpAt: { lt: startOfToday } },
          orderBy: { followUpAt: "asc" },
          take: 8,
          select: { id: true, name: true, phone: true, message: true, followUpAt: true },
        }),
      [],
    ),
    safeQuery(
      "mobile:dueTodayLeads",
      () =>
        prisma.leadInquiry.findMany({
          where: {
            ...scope,
            status: { in: OPEN_STATUSES },
            followUpAt: { gte: startOfToday, lt: endOfToday },
          },
          orderBy: { followUpAt: "asc" },
          take: 8,
          select: { id: true, name: true },
        }),
      [],
    ),
    getMyAppointmentsToday(session.id),
    safeQuery(
      "mobile:unassignedCount",
      () => prisma.leadInquiry.count({ where: { assignedToId: null, status: { in: OPEN_STATUSES } } }),
      0,
    ),
  ]);

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeFormat = new Intl.DateTimeFormat(intlLocale(locale), { hour: "2-digit", minute: "2-digit" });

  function hoursOverdue(followUpAt: Date | null): number {
    if (!followUpAt) return 0;
    return Math.max(1, Math.round((startOfToday.getTime() - followUpAt.getTime()) / (60 * 60_000)));
  }

  const isEmpty = overdueLeads.length === 0 && todayAppointments.length === 0 && dueTodayLeads.length === 0;

  return (
    <MobileShell locale={locale} active="today" eyebrow={dateFormat.format(now)} title={t("today.title")}>
      {/* An empty list during an outage reads as "you have no leads",
          which is the wrong and more alarming of the two meanings. */}
      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
          {tRoot("common.offline")}
        </p>
      )}

      {isEmpty && (
        <p className="rounded-xs border border-dashed border-primary/20 bg-white p-5 text-center text-sm text-ink-muted">
          {t("today.empty")}
        </p>
      )}

      {overdueLeads.map((lead) => (
        <div key={lead.id} className="space-y-2 rounded-xs border border-red-200 bg-white p-3.5">
          <span className="inline-flex w-fit items-center rounded-xs bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
            {t("today.overdueBy", { hours: hoursOverdue(lead.followUpAt) })}
          </span>
          <p className="text-sm font-semibold text-primary">{lead.name}</p>
          {lead.message && <p className="line-clamp-2 text-xs text-ink-muted">{lead.message}</p>}
          <div className="flex gap-2">
            <a
              href={`tel:${lead.phone}`}
              className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xs bg-primary text-sm font-medium text-white"
            >
              <Phone size={14} aria-hidden />
              {t("today.callNow")}
            </a>
            <Link
              href={`/${locale}/admin/m/leads/${lead.id}`}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xs border border-primary/20 text-sm font-medium text-primary"
            >
              {t("today.openLead")}
            </Link>
          </div>
        </div>
      ))}

      {todayAppointments.map((appt) => (
        <div key={appt.id} className="space-y-2 rounded-xs border border-primary/10 bg-white p-3.5">
          <span className="inline-flex w-fit items-center rounded-xs bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            {t("today.appointmentAt", { time: timeFormat.format(appt.scheduledAt) })}
          </span>
          <p className="text-sm font-semibold text-primary">{appt.customerName ?? t("today.noCustomer")}</p>
          <p className="text-xs text-ink-muted">{appt.projectName ?? t("today.noProject")}</p>
          <div className="flex gap-2">
            {appt.location ? (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appt.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xs border border-primary/20 text-sm font-medium text-primary"
              >
                <Navigation size={14} aria-hidden />
                {t("today.directions")}
              </a>
            ) : (
              <span className="flex-1" />
            )}
            <MobileCheckInButton locale={locale} appointmentId={appt.id} label={t("today.checkIn")} />
          </div>
        </div>
      ))}

      {dueTodayLeads.map((lead) => (
        <div key={lead.id} className="space-y-2 rounded-xs border border-primary/10 bg-white p-3.5">
          <span className="inline-flex w-fit items-center rounded-xs bg-accent-50 px-2.5 py-1 text-[11px] font-semibold text-accent-700">
            {t("today.followUpToday")}
          </span>
          <p className="text-sm font-semibold text-primary">{lead.name}</p>
          <div className="flex gap-2">
            <Link
              href={`/${locale}/admin/m/leads/${lead.id}`}
              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xs border border-primary/20 text-sm font-medium text-primary"
            >
              {t("today.addNote")}
            </Link>
            <MobilePostponeButton locale={locale} leadId={lead.id} label={t("today.postpone")} />
          </div>
        </div>
      ))}

      {unassignedCount > 0 && (
        <Link
          href={`/${locale}/admin/m/leads`}
          className="block rounded-xs border border-dashed border-primary/25 bg-white p-3.5 text-center text-sm text-ink-muted"
        >
          {t("today.unassignedBanner", { count: unassignedCount })}
        </Link>
      )}
    </MobileShell>
  );
}
