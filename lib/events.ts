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

// Not `satisfies Prisma.EventSelect` — `translations` is a relation added
// to Event in this follow-up i18n pass (see schema.prisma's Event model)
// that the locally generated Prisma client doesn't type yet; same
// `prisma as any` sandbox situation as getProjectBySlug in lib/projects.ts.
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
  registrations: {
    where: { status: { in: [...SEAT_TAKING_STATUSES] } },
    select: { partySize: true },
  },
};

type CardRow = any;

function toCard(row: CardRow, locale: string, now: Date): EventCard {
  // partySize matters: one registration for four people takes four seats.
  const taken = row.registrations.reduce((sum: number, r: { partySize: number }) => sum + r.partySize, 0);
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
      (prisma as any).event.findMany({
        where: publishedWhere(),
        orderBy: { startsAt: "asc" },
        select: CARD_SELECT,
      }),
    [] as CardRow[],
  );

  const now = new Date();
  const cards = rows.map((row) => toCard(row, locale, now));

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
        (prisma as any).event.findUnique({
          where: { slug },
          select: { ...CARD_SELECT, isPublished: true },
        }),
      null,
    );

    if (!row || !row.isPublished) return null;

    return toCard(row, locale, new Date());
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
