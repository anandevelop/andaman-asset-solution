/**
 * lib/events.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server-only data access for Event / EventRegistration.
 *
 * An event's "upcoming" boundary is endsAt when present, otherwise startsAt:
 * a viewing that runs 10:00–16:00 should stay listed as on-now at 14:00, not
 * flip to "past" the moment it begins.
 *
 * Remaining capacity counts CONFIRMED and PENDING registrations but not
 * CANCELLED or NO_SHOW — a cancelled seat has to return to the pool, or the
 * event silently sells out below its real capacity.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { cache } from "react";
import { EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { pickLocale } from "@/lib/locale";
import { getTranslation } from "@/lib/get-translation";

export type EventCard = {
  id: string;
  slug: string;
  title: string;
  description: string;
  location: string | null;
  startsAt: Date;
  endsAt: Date | null;
  coverImageUrl: string | null;
  capacity: number | null;
  /** Null when capacity is unlimited. */
  seatsLeft: number | null;
  isPast: boolean;
};

/** Registration statuses that occupy a seat. */
export const SEAT_TAKING_STATUSES = [
  EventStatus.PENDING,
  EventStatus.CONFIRMED,
  EventStatus.ATTENDED,
] as const;

function publishedWhere(): Prisma.EventWhereInput {
  return { isPublished: true };
}

// `satisfies Prisma.EventSelect` is back — see the same note in
// lib/news.ts. The generated client types the `translations` relation now,
// so the clause that was dropped for it can do its job again.
const CARD_SELECT = {
  id: true,
  slug: true,
  titleEn: true,
  titleTh: true,
  descriptionEn: true,
  descriptionTh: true,
  translations: true,
  location: true,
  startsAt: true,
  endsAt: true,
  coverImageUrl: true,
  capacity: true,
} satisfies Prisma.EventSelect;

type CardRow = any;

/*
  Seats are summed in the database, not in Node.

  This select used to carry `registrations: { select: { partySize: true } }`,
  so rendering the events list pulled every seat-taking registration for
  every published event into memory and reduced them to one integer each.
  On the home page and /events that is the whole event_registrations table
  on every request, and it is the query that grows fastest as the company
  runs more events — the cost climbs with total attendance ever, while the
  thing being displayed stays one number per card.

  countTakenSeats() below already had the aggregate form for a single
  event; this is its batched sibling, following the same one-query-then-
  join-in-a-Map shape as getProjectConversions in lib/reports.ts.
*/
async function takenSeatsByEvent(eventIds: string[]): Promise<Map<string, number>> {
  if (eventIds.length === 0) return new Map();

  const rows = await safeQuery(
    "eventRegistration.groupBy(seats)",
    () =>
      prisma.eventRegistration.groupBy({
        by: ["eventId"],
        where: {
          eventId: { in: eventIds },
          status: { in: [...SEAT_TAKING_STATUSES] },
        },
        _sum: { partySize: true },
      }),
    [] as { eventId: string; _sum: { partySize: number | null } }[],
  );

  return new Map(rows.map((row) => [row.eventId, row._sum.partySize ?? 0]));
}

function toCard(row: CardRow, locale: string, now: Date, taken: number): EventCard {
  const t = getTranslation<any>(row.translations, locale);

  return {
    id: row.id,
    slug: row.slug,
    title: t?.title ?? pickLocale(locale, row.titleTh, row.titleEn),
    description: t?.description ?? pickLocale(locale, row.descriptionTh, row.descriptionEn),
    location: row.location,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    coverImageUrl: row.coverImageUrl,
    capacity: row.capacity,
    seatsLeft: row.capacity === null ? null : Math.max(0, row.capacity - taken),
    isPast: (row.endsAt ?? row.startsAt) < now,
  };
}

/**
 * Published events split into upcoming (soonest first — the next thing you
 * can attend is the most useful) and past (most recent first).
 */
export async function getPublishedEvents(
  locale: string,
): Promise<{ upcoming: EventCard[]; past: EventCard[] }> {
  const rows = await safeQuery(
    "event.findMany(published)",
    () =>
      prisma.event.findMany({
        where: publishedWhere(),
        orderBy: { startsAt: "asc" },
        select: CARD_SELECT,
      }),
    [] as CardRow[],
  );

  // partySize matters: one registration for four people takes four seats.
  const taken = await takenSeatsByEvent(rows.map((row) => row.id));

  const now = new Date();
  const cards = rows.map((row) => toCard(row, locale, now, taken.get(row.id) ?? 0));

  return {
    upcoming: cards.filter((event) => !event.isPast),
    past: cards.filter((event) => event.isPast).reverse(),
  };
}

/** One published event by slug, or null. */
export const getEventBySlug = cache(
  async (slug: string, locale: string): Promise<EventCard | null> => {
    const row = await safeQuery<CardRow | null>(
      `event.findUnique(${slug})`,
      () =>
        prisma.event.findUnique({
          where: { slug },
          select: { ...CARD_SELECT, isPublished: true },
        }),
      null,
    );

    if (!row || !row.isPublished) return null;

    return toCard(row, locale, new Date(), await countTakenSeats(row.id));
  },
);

export async function getPublishedEventSlugs(): Promise<string[]> {
  const rows = await safeQuery(
    "event.findMany(slugs)",
    () =>
      prisma.event.findMany({
        where: publishedWhere(),
        select: { slug: true },
      }),
    [] as { slug: string }[],
  );
  return rows.map((row) => row.slug);
}

/** Published events for the sitemap. */
export async function getEventSitemapEntries(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  return safeQuery(
    "event.findMany(sitemap)",
    () =>
      prisma.event.findMany({
        where: publishedWhere(),
        select: { slug: true, updatedAt: true },
        orderBy: { startsAt: "desc" },
      }),
    [] as { slug: string; updatedAt: Date }[],
  );
}

/**
 * Seats already taken for an event. Shared by the RSVP route so the public
 * page and the capacity check agree on what "full" means.
 */
export async function countTakenSeats(eventId: string): Promise<number> {
  const result = await prisma.eventRegistration.aggregate({
    where: { eventId, status: { in: [...SEAT_TAKING_STATUSES] } },
    _sum: { partySize: true },
  });

  return result._sum.partySize ?? 0;
}
