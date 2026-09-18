import "server-only";

/**
 * lib/admin/event-registrations.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read side of one event's registration desk (Events.dc.html) — the seat
 * count, the list, and the two numbers in the header.
 *
 * SEATS ARE COUNTED IN PEOPLE, NOT IN ROWS.
 *
 * A registration carries `partySize`: one row can be four guests. Counting
 * rows against `capacity` would seat eighty parties in an eighty-seat room
 * and put a hundred and forty people in it, which is the mistake this
 * page exists to prevent — so "68 of 80" below is heads, and the footer
 * reports the row count separately.
 *
 * Which statuses hold a seat is not decided here — SEAT_TAKING_STATUSES in
 * lib/events.ts already answers that for the public RSVP route, and this
 * page must not give a different answer to "is it full".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
// The one definition of "this registration occupies a seat", shared with
// the public capacity check in the RSVP route. A second copy here would
// eventually disagree with it, and the two numbers people compare are
// "is it full" on the website and "is it full" on this page.
import { SEAT_TAKING_STATUSES } from "@/lib/events";

export const REGISTRATIONS_PER_PAGE = 25;

export type RegistrationRow = {
  id: string;
  name: string;
  agencyName: string | null;
  email: string;
  phone: string;
  partySize: number;
  locale: string | null;
  status: EventStatus;
  checkedInAt: Date | null;
  leadId: string | null;
  createdAt: Date;
};

export type SeatCounts = {
  /** Seats held by confirmed parties. */
  confirmed: number;
  /** Seats held by parties who have not confirmed yet. */
  pending: number;
  /** capacity − (confirmed + pending), or null when the event is open. */
  free: number | null;
  /** Heads registered and not cancelled. */
  taken: number;
  capacity: number | null;
};

export type RegistrationFilters = {
  search: string;
  status: string;
  locale: string;
  page: number;
};

export type RegistrationsView = {
  rows: RegistrationRow[];
  seats: SeatCounts;
  /** Rows matching the filters — the footer's "of N". */
  total: number;
  /** Heads across those rows, which is the more useful total for catering. */
  totalGuests: number;
  /** Registrations already turned into leads. */
  leadCount: number;
  page: number;
  pageCount: number;
};

const EMPTY: RegistrationsView = {
  rows: [],
  seats: { confirmed: 0, pending: 0, free: null, taken: 0, capacity: null },
  total: 0,
  totalGuests: 0,
  leadCount: 0,
  page: 1,
  pageCount: 1,
};

function whereFrom(eventId: string, filters: RegistrationFilters): Prisma.EventRegistrationWhereInput {
  const search = filters.search.trim();

  return {
    eventId,
    ...(filters.status !== "ALL" && (Object.values(EventStatus) as string[]).includes(filters.status)
      ? { status: filters.status as EventStatus }
      : {}),
    ...(filters.locale !== "ALL" ? { locale: filters.locale } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search } },
            { agencyName: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
}

export async function getEventRegistrations(
  eventId: string,
  capacity: number | null,
  filters: RegistrationFilters,
): Promise<RegistrationsView> {
  return safeQuery(
    "admin:event:registrations",
    async () => {
      const where = whereFrom(eventId, filters);

      const [rows, total, guestSum, leadCount, seatGroups] = await Promise.all([
        prisma.eventRegistration.findMany({
          where,
          orderBy: { createdAt: "asc" },
          skip: (filters.page - 1) * REGISTRATIONS_PER_PAGE,
          take: REGISTRATIONS_PER_PAGE,
          select: {
            id: true,
            name: true,
            agencyName: true,
            email: true,
            phone: true,
            partySize: true,
            locale: true,
            status: true,
            checkedInAt: true,
            leadId: true,
            createdAt: true,
          },
        }),
        prisma.eventRegistration.count({ where }),
        prisma.eventRegistration.aggregate({ where, _sum: { partySize: true } }),
        prisma.eventRegistration.count({ where: { eventId, leadId: { not: null } } }),
        // Seats are counted across the whole event, never through the
        // filters — a status filter must not make the room look emptier.
        prisma.eventRegistration.groupBy({
          by: ["status"],
          where: { eventId },
          _sum: { partySize: true },
        }),
      ]);

      const seatsBy = (status: EventStatus) =>
        seatGroups.find((group) => group.status === status)?._sum.partySize ?? 0;

      /*
        Split for the bar's two colours, but only across the statuses the
        shared rule counts: someone who has confirmed or already arrived is
        a certain seat, someone who has not replied is a held one.
        CANCELLED and NO_SHOW are absent from SEAT_TAKING_STATUSES and so
        release the seat here too.
      */
      const holds = (status: EventStatus) =>
        (SEAT_TAKING_STATUSES as readonly EventStatus[]).includes(status) ? seatsBy(status) : 0;

      const confirmed = holds(EventStatus.CONFIRMED) + holds(EventStatus.ATTENDED);
      const pending = holds(EventStatus.PENDING);
      const taken = confirmed + pending;

      const pageCount = Math.max(1, Math.ceil(total / REGISTRATIONS_PER_PAGE));

      return {
        rows,
        seats: {
          confirmed,
          pending,
          free: capacity === null ? null : Math.max(0, capacity - taken),
          taken,
          capacity,
        },
        total,
        totalGuests: guestSum._sum.partySize ?? 0,
        leadCount,
        page: Math.min(filters.page, pageCount),
        pageCount,
      };
    },
    EMPTY,
  );
}
