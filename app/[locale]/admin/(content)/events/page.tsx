/**
 * app/[locale]/admin/events/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Event index, upcoming first. The registration count is shown against
 * capacity because "18" means nothing on its own — "18 / 20" is the number
 * an organiser actually acts on.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Pencil, Plus, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { Role } from "@prisma/client";
import { hasRole } from "@/lib/role-rank";
import { SEAT_TAKING_STATUSES } from "@/lib/events";
import { intlLocale } from "@/lib/format";
import { translationCompleteness } from "@/lib/admin/translated-form";
import TranslationStatusBadges from "@/components/admin/TranslationStatusBadges";

type Props = { params: Promise<{ locale: string }> };

export default async function AdminEventsPage(props: Props) {
  const params = await props.params;

  const {
    locale
  } = params;

  // VIEWER may see the list — every action from here on is a Link to a
  // page with its own guard (edit: EDITOR, registrations:
  // viewCustomerContact), so there is no in-page write control to gate
  // beyond the "New" button below.
  const session = await requireAdmin(locale, Role.VIEWER);
  // Matches ../new/page.tsx's own guard exactly — see the note by the
  // "New" button below.
  const canCreate = hasRole(session.role, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });

  const events = await safeQuery(
    "admin:events",
    () =>
      prisma.event.findMany({
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          slug: true,
          titleEn: true,
          titleTh: true,
          translations: true,
          location: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          isPublished: true,
          registrations: {
            where: { status: { in: [...SEAT_TAKING_STATUSES] } },
            select: { partySize: true },
          },
        },
      }),
    [] as any[],
  );

  const offline = isDatabaseOffline();
  const now = new Date();

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Upcoming first — that is what needs attention — then past, most recent.
  const upcoming = events.filter((e) => (e.endsAt ?? e.startsAt) >= now).reverse();
  const past = events.filter((e) => (e.endsAt ?? e.startsAt) < now);
  const ordered = [...upcoming, ...past];

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="admin-section-title">{t("brand")}</p>
          <h1 className="mt-2 text-2xl font-semibold text-primary sm:text-3xl">
            {t("events.title")}
          </h1>
          <p className="mt-2 text-sm text-ink-muted">{t("events.subtitle")}</p>
        </div>

        {/* Hidden below ADMIN because ../new/page.tsx guards at
            requireAdmin(locale, Role.ADMIN). The button follows the page,
            not the other way round: widening the page to match the button
            would hand every editor the ability to create events, which is
            a permissions change, not a UI fix. */}
        {canCreate && (
          <Link href={`/${locale}/admin/events/new`} className="admin-btn">
            <Plus size={16} aria-hidden />
            {t("events.new")}
          </Link>
        )}
      </header>

      {offline && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      {ordered.length === 0 ? (
        <div className="admin-card text-center text-sm text-ink-muted">
          {t("events.empty")}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xs border border-primary/10 bg-surface-raised shadow-card">
          <table className="w-full min-w-[820px] border-collapse">
            <thead className="border-b border-primary/10 bg-surface-muted">
              <tr>
                <th className="admin-th">{t("events.eventTitle")}</th>
                <th className="admin-th">{t("events.startsAt")}</th>
                <th className="admin-th">{t("events.registrations")}</th>
                <th className="admin-th">{t("common.published")}</th>
                <th className="admin-th" />
              </tr>
            </thead>

            <tbody className="divide-y divide-primary/5">
              {ordered.map((event) => {
                const booked = event.registrations.reduce(
                  (sum: number, r: { partySize: number }) => sum + r.partySize,
                  0,
                );
                const isPast = (event.endsAt ?? event.startsAt) < now;
                const full = event.capacity !== null && booked >= event.capacity;
                const completeness = translationCompleteness<any>(event.translations, "title");

                return (
                  <tr
                    key={event.id}
                    className={`transition-colors hover:bg-surface-muted/60 ${
                      isPast ? "opacity-60" : ""
                    }`}
                  >
                    <td className="admin-td">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-primary">
                          {locale === "th" ? event.titleTh : event.titleEn}
                        </p>
                        <TranslationStatusBadges completeness={completeness} />
                      </div>
                      <p className="mt-0.5 font-mono text-xs text-ink-muted">
                        /{event.slug}
                      </p>
                      {event.location && (
                        <p className="mt-0.5 text-xs text-ink-muted">{event.location}</p>
                      )}
                    </td>

                    <td className="admin-td whitespace-nowrap text-ink-muted">
                      <time dateTime={event.startsAt.toISOString()}>
                        {dateFormat.format(event.startsAt)}
                      </time>
                      {isPast && (
                        <p className="mt-0.5 text-xs">{t("events.pastLabel")}</p>
                      )}
                    </td>

                    <td className="admin-td whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 text-sm ${
                          full ? "font-medium text-amber-700" : "text-ink-muted"
                        }`}
                      >
                        <Users size={14} aria-hidden />
                        {event.capacity === null
                          ? booked
                          : `${booked} / ${event.capacity}`}
                      </span>
                    </td>

                    <td className="admin-td whitespace-nowrap">
                      <span
                        className={
                          event.isPublished
                            ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                            : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                        }
                      >
                        {event.isPublished ? t("common.published") : t("common.draft")}
                      </span>
                    </td>

                    <td className="admin-td whitespace-nowrap text-right">
                      <span className="flex justify-end gap-3">
                        <Link
                          href={`/${locale}/admin/events/${event.id}/registrations`}
                          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
                        >
                          <Users size={14} aria-hidden />
                          {t("events.manageRegistrations")}
                        </Link>
                        <Link
                          href={`/${locale}/admin/events/${event.id}/edit`}
                          className="inline-flex items-center gap-1.5 text-sm text-accent-700 hover:text-accent-800"
                        >
                          <Pencil size={14} aria-hidden />
                          {t("common.edit")}
                        </Link>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
