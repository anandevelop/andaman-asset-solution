/**
 * app/[locale]/admin/events/[id]/registrations/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * One event's registration desk (Events.dc.html) — how full the room is,
 * who is coming, and the two things a rep does with that list: turn
 * somebody into a lead, and check them in at the door.
 *
 * Split from the event's edit page, which had this as a plain table under
 * the form. Editing the event copy and working the door list on the
 * morning of the event are different jobs, and the second one needs the
 * whole screen.
 *
 * Gated on the customer-contact capability rather than a rank: this page
 * is a list of names, emails and phone numbers. See lib/permissions.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, CalendarDays, MapPin, Pencil } from "lucide-react";
import { EventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireCapability } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import { locales } from "@/i18n";
import {
  getEventRegistrations,
  REGISTRATIONS_PER_PAGE,
} from "@/lib/admin/event-registrations";
import RegistrationDesk, { type RegistrationView } from "@/components/admin/RegistrationDesk";
import RegistrationFilters from "@/components/admin/RegistrationFilters";
import TablePagination from "@/components/admin/TablePagination";

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ q?: string; status?: string; lang?: string; page?: string }>;
};

export default async function AdminEventRegistrationsPage(props: Props) {
  const [{ locale, id }, searchParams] = await Promise.all([props.params, props.searchParams]);

  await requireCapability(locale, "viewCustomerContact");

  const t = await getTranslations({ locale, namespace: "admin" });

  const event = await safeQuery(
    "admin:event:header",
    () =>
      prisma.event.findUnique({
        where: { id },
        select: {
          id: true,
          titleEn: true,
          titleTh: true,
          startsAt: true,
          endsAt: true,
          location: true,
          capacity: true,
          isPublished: true,
          coverImageUrl: true,
          translations: { select: { locale: true, title: true } },
        },
      }),
    undefined,
  );

  if (!event) notFound();

  const page = Number(searchParams.page);
  const filters = {
    search: searchParams.q ?? "",
    status: searchParams.status ?? "ALL",
    locale: searchParams.lang ?? "ALL",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };

  const view = await getEventRegistrations(event.id, event.capacity, filters);

  const title = locale === "th" ? event.titleTh : event.titleEn;

  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
  });
  const stampFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusLabels = Object.fromEntries(
    Object.values(EventStatus).map((value) => [value, t(`eventStatus.${value}` as never)]),
  ) as Record<EventStatus, string>;

  const rows: RegistrationView[] = view.rows.map((row) => ({
    id: row.id,
    name: row.name,
    agencyName: row.agencyName,
    email: row.email,
    phone: row.phone,
    partySize: row.partySize,
    locale: row.locale,
    status: row.status,
    checkedIn: row.checkedInAt !== null,
    leadId: row.leadId,
    registeredAt: stampFormat.format(row.createdAt),
  }));

  // Seat bar widths. Against capacity when there is one; against the
  // registered total when the event is open-ended, so the bar still shows
  // the confirmed/pending split rather than collapsing to nothing.
  const barTotal = view.seats.capacity ?? Math.max(1, view.seats.taken);
  const pct = (value: number) => `${Math.min(100, (value / barTotal) * 100)}%`;

  return (
    <div className="space-y-6">
      <Link
        href={`/${locale}/admin/events`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
      >
        <ArrowLeft size={14} aria-hidden />
        {t("events.title")}
      </Link>

      {/* ── The room ─────────────────────────────────────────────────── */}
      <section className="admin-card">
        <div className="flex flex-col gap-5 lg:flex-row">
          {event.coverImageUrl && (
            /* Plain <img>, like every other admin thumbnail. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.coverImageUrl}
              alt=""
              className="h-32 w-full shrink-0 rounded-xs bg-surface-muted object-cover lg:w-56"
            />
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold text-primary sm:text-2xl">{title}</h1>
              <span
                className={
                  event.isPublished
                    ? "rounded-xs bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800"
                    : "rounded-xs bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted"
                }
              >
                {event.isPublished ? t("common.published") : t("common.draft")}
              </span>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-ink-muted">
              <span className="flex items-center gap-1.5">
                <CalendarDays size={14} aria-hidden />
                {dateFormat.format(event.startsAt)} · {timeFormat.format(event.startsAt)}
                {event.endsAt && `–${timeFormat.format(event.endsAt)}`}
              </span>
              {event.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={14} aria-hidden />
                  {event.location}
                </span>
              )}
              <span className="flex gap-1">
                {locales.map((code) => {
                  const filled = event.translations.some(
                    (row) => row.locale === code && (row.title ?? "").trim().length > 0,
                  );
                  return (
                    <span
                      key={code}
                      className={`rounded-xs px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        filled ? "bg-primary text-white" : "bg-surface-muted text-ink-muted/70"
                      }`}
                    >
                      {code}
                    </span>
                  );
                })}
              </span>
            </div>

            {/* Seats, in people rather than rows — see the note in
                lib/admin/event-registrations.ts. */}
            <div className="mt-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-ink">
                  {view.seats.capacity === null
                    ? t("events.seats.noCapacity", { taken: view.seats.taken })
                    : t("events.seats.taken", {
                        taken: view.seats.taken,
                        capacity: view.seats.capacity,
                      })}
                </p>
                {view.seats.free !== null && (
                  <p
                    className={`text-sm font-semibold ${view.seats.free === 0 ? "text-red-700" : "text-accent-800"}`}
                  >
                    {view.seats.free === 0
                      ? t("events.seats.full")
                      : t("events.seats.free", { count: view.seats.free })}
                  </p>
                )}
              </div>

              <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-surface-muted">
                <span className="bg-emerald-500" style={{ width: pct(view.seats.confirmed) }} />
                <span className="bg-accent" style={{ width: pct(view.seats.pending) }} />
              </div>

              <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" aria-hidden />
                  {t("events.seats.confirmed", { count: view.seats.confirmed })}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-xs bg-accent" aria-hidden />
                  {t("events.seats.pending", { count: view.seats.pending })}
                </span>
                {view.seats.free !== null && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-xs bg-surface-muted" aria-hidden />
                    {t("events.seats.empty", { count: view.seats.free })}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-3 lg:w-56 lg:border-l lg:border-primary/10 lg:pl-5">
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-semibold text-primary">{view.total}</p>
                <p className="text-xs text-ink-muted">{t("events.registrationCount")}</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-primary">{view.leadCount}</p>
                <p className="text-xs text-ink-muted">{t("events.leadsCreated")}</p>
              </div>
            </div>

            <Link
              href={`/${locale}/admin/events/${event.id}/edit`}
              className="admin-btn-ghost justify-center py-2! text-sm"
            >
              <Pencil size={14} aria-hidden />
              {t("events.editEvent")}
            </Link>
          </div>
        </div>
      </section>

      {isDatabaseOffline() && (
        <p className="rounded-xs border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t("common.offline")}
        </p>
      )}

      <RegistrationFilters
        basePath={`/${locale}/admin/events/${event.id}/registrations`}
        exportPath={`/api/admin/events/${event.id}/registrations/export`}
        activeSearch={filters.search}
        activeStatus={filters.status}
        activeLocale={filters.locale}
        statusLabels={statusLabels}
        labels={{
          searchPlaceholder: t("events.searchRegistrations"),
          status: t("events.filterStatus"),
          language: t("events.filterLanguage"),
          all: t("common.all"),
          exportCsv: t("events.exportList"),
        }}
      />

      <RegistrationDesk
        locale={locale}
        eventId={event.id}
        rows={rows}
        statusLabels={statusLabels}
        labels={{
          checkInMode: t("events.checkIn.enter"),
          exitCheckIn: t("events.checkIn.exit"),
          columnPerson: t("events.columns.person"),
          columnContact: t("events.columns.contact"),
          columnParty: t("events.columns.party"),
          columnLanguage: t("events.columns.language"),
          columnStatus: t("events.columns.status"),
          columnLead: t("events.columns.lead"),
          columnRegistered: t("events.columns.registered"),
          linkedLead: t("events.lead.linked"),
          notLinked: t("events.lead.notLinked"),
          createLead: t("events.lead.create"),
          arrived: t("events.checkIn.arrived"),
          notArrived: t("events.checkIn.notArrived"),
          markArrived: t("events.checkIn.mark"),
          undoArrival: t("events.checkIn.undo"),
          empty: t("events.noRegistrations"),
          error: t("common.error"),
          checkInHint: t("events.checkIn.hint"),
        }}
      />

      {view.total > 0 && (
        <TablePagination
          basePath={`/${locale}/admin/events/${event.id}/registrations`}
          page={view.page}
          pageCount={view.pageCount}
          perPage={REGISTRATIONS_PER_PAGE}
          perPageOptions={[
            { value: REGISTRATIONS_PER_PAGE, label: t("events.perPage", { count: REGISTRATIONS_PER_PAGE }) },
          ]}
          labels={{
            showing: t("events.showing", {
              start: (view.page - 1) * REGISTRATIONS_PER_PAGE + 1,
              end: Math.min(view.page * REGISTRATIONS_PER_PAGE, view.total),
              total: view.total,
              guests: view.totalGuests,
            }),
            perPageAria: t("projects.pagination.perPageAria"),
            previous: t("projects.pagination.previous"),
            next: t("projects.pagination.next"),
            page: t("projects.pagination.page"),
          }}
        />
      )}
    </div>
  );
}
