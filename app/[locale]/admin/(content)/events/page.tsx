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
import { AlertTriangle, Clock, MapPin, Pencil, Plus, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { safeQuery, isDatabaseOffline } from "@/lib/db";
import { requireAdmin } from "@/lib/admin/guard";
import { Role } from "@prisma/client";
import { hasRole } from "@/lib/role-rank";
import { can } from "@/lib/permissions";
import { SEAT_TAKING_STATUSES } from "@/lib/events";
import { intlLocale } from "@/lib/format";
import { translationCompleteness } from "@/lib/admin/translated-form";
import LocaleFlags from "@/components/admin/ui/LocaleFlags";
import CopyLinkButton from "@/components/admin/CopyLinkButton";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { zoneEyebrow } from "@/lib/admin/nav";
import AdminImage from "@/components/admin/ui/AdminImage";

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
  const canSeeRegistrations = can(session.role, "viewCustomerContact");

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
          coverImageUrl: true,
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
      <AdminPageHeader
        eyebrow={zoneEyebrow((key) => t(key as never), "events")}
        title={t("events.title")}
        description={t("events.subtitle")}
        actions={
          <>
            {/* Hidden below ADMIN because ../new/page.tsx guards at
                requireAdmin(locale, Role.ADMIN). The button follows the
                page, not the other way round: widening the page to match
                the button would hand every editor the ability to create
                events, which is a permissions change, not a UI fix. */}
            {canCreate && (
              <Link href={`/${locale}/admin/events/new`} className="admin-btn">
                <Plus size={16} aria-hidden />
                {t("events.new")}
              </Link>
            )}
          </>
        }
      />

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
        /* Horizontal cards (v4): the photo, when and where, and how full
           it is — the three things an events coordinator checks — on one
           line each. A card is not a link itself because it carries two
           (edit, registrations); the title is the edit link. */
        <ul className="space-y-3">
          {ordered.map((event) => {
            const booked = event.registrations.reduce(
              (sum: number, r: { partySize: number }) => sum + r.partySize,
              0,
            );
            const ends = event.endsAt ?? event.startsAt;
            const isPast = ends < now;
            const isLive = event.startsAt <= now && now <= ends;
            const full = event.capacity !== null && booked >= event.capacity;
            const completeness = translationCompleteness<any>(event.translations, "title");

            return (
              <li
                key={event.id}
                className="admin-card flex flex-col overflow-hidden p-0! sm:flex-row"
              >
                <span className="relative block h-40 w-full shrink-0 sm:h-auto sm:min-h-[130px] sm:w-[220px]">
                  <AdminImage
                    src={event.coverImageUrl}
                    loading="lazy"
                    iconSize={24}
                    className={`absolute inset-0 h-full w-full object-cover ${isPast ? "opacity-60 grayscale-[40%]" : ""}`}
                  />
                </span>

                <div className="flex min-w-0 flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        event.isPublished ? "bg-adm-success-bg text-adm-success" : "bg-adm-neutral-bg text-adm-neutral"
                      }`}
                    >
                      {event.isPublished ? t("common.published") : t("common.draft")}
                    </span>
                    {isLive && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-adm-danger px-2 py-0.5 text-[10.5px] font-semibold text-white">
                        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" />
                        {t("events.live")}
                      </span>
                    )}
                    {isPast && (
                      <span className="rounded-full bg-adm-text/6 px-2 py-0.5 text-[11px] text-adm-muted">
                        {t("events.pastLabel")}
                      </span>
                    )}
                    <span className="ml-auto">
                      <LocaleFlags
                        locales={LOCALE_DISPLAY_ORDER.map((code) => ({
                          locale: code,
                          state: completeness[code] ? "complete" : "missing",
                        }))}
                      />
                    </span>
                  </div>

                  <Link
                    href={`/${locale}/admin/events/${event.id}/edit`}
                    className="truncate text-lg font-semibold leading-snug text-adm-text hover:text-adm-accent-ink"
                  >
                    {(locale === "th" ? event.titleTh : event.titleEn) || event.titleEn || event.titleTh}
                  </Link>

                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-adm-muted">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={13} aria-hidden />
                      <time dateTime={event.startsAt.toISOString()}>{dateFormat.format(event.startsAt)}</time>
                    </span>
                    {event.location && (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin size={13} aria-hidden className="shrink-0" />
                        <span className="truncate">{event.location}</span>
                      </span>
                    )}
                  </p>

                  <div className="max-w-[320px]">
                    <p className={`flex items-center gap-1.5 text-xs ${full ? "font-medium text-adm-warning" : "text-adm-muted"}`}>
                      <Users size={13} aria-hidden />
                      <span className="tabular-nums">
                        {event.capacity === null
                          ? t("events.registeredOpen", { count: booked })
                          : t("events.registeredOf", { count: booked, capacity: event.capacity })}
                      </span>
                    </p>
                    {event.capacity !== null && event.capacity > 0 && (
                      <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-adm-line">
                        <span
                          className={`block h-full rounded-full ${full ? "bg-adm-warning" : "bg-adm-status-info"}`}
                          style={{ width: `${Math.min(100, (booked / event.capacity) * 100)}%` }}
                        />
                      </span>
                    )}
                  </div>

                  {/* A hint only when there is something to fix before the
                      event: a capacity of one is almost always a typo, and a
                      missing Thai title shows English on the Thai site. */}
                  {!isPast && ((event.capacity !== null && event.capacity <= 1) || !completeness.th) && (
                    <p className="flex items-center gap-1.5 text-xs text-adm-warning">
                      <AlertTriangle size={13} aria-hidden />
                      {event.capacity !== null && event.capacity <= 1
                        ? t("events.hintCapacity", { capacity: event.capacity })
                        : t("events.hintMissingThai")}
                    </p>
                  )}

                  <span className="mt-1 flex flex-wrap gap-2">
                    {/* Registrations are customer data: the link only for
                        a role that page admits (viewCustomerContact). */}
                    {canSeeRegistrations && (
                      <Link
                        href={`/${locale}/admin/events/${event.id}/registrations`}
                        className="admin-btn-ghost admin-btn-sm"
                      >
                        <Users size={13} aria-hidden />
                        {t("events.manageRegistrations")}
                      </Link>
                    )}
                    <Link href={`/${locale}/admin/events/${event.id}/edit`} className="admin-btn-ghost admin-btn-sm">
                      <Pencil size={13} aria-hidden />
                      {t("common.edit")}
                    </Link>
                    {event.isPublished && !isPast && (
                      <CopyLinkButton
                        path={`/${locale}/events/${event.slug}`}
                        label={t("events.shareLink")}
                        copiedLabel={t("events.linkCopied")}
                      />
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
