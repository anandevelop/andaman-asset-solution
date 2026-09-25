/**
 * lib/analytics/live-visit.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "How many people are on the site right now, on which page, and for how
 * long" — the one question GA4 cannot answer for us.
 *
 * Its Realtime API reports `unifiedScreenName` (a page *title*, not a
 * path), looks back thirty minutes, and has no time-on-page metric at all:
 * activeUsers, screenPageViews, eventCount, keyEvents and nothing else. So
 * the site counts its own, on the beacon that already exists.
 *
 * IDENTIFYING A VISIT WITHOUT IDENTIFYING A PERSON
 *
 * A row has to be updated as one visit moves between pages, which needs
 * something stable per visit. It is a one-way hash of IP + user agent + a
 * salt. The IP never leaves the request and is never written anywhere; what
 * is stored cannot be worked back to it without the salt, and the salt is
 * not in the database.
 *
 * ANALYTICS_SALT is RECOMMENDED rather than required, and the fallback is
 * the interesting part: a random value generated once per process. Without
 * it, IP + user agent is guessable enough that anyone who could read the
 * table could confirm whether a *particular* IP was on the site by hashing
 * it themselves. A per-process random salt costs only that visits stop
 * being comparable across a restart — a fifteen-minute window, so the cost
 * is a few rows briefly double-counted — and it fails closed instead of
 * open.
 *
 * NOTHING HERE ACCUMULATES
 *
 * Rows are updated in place and anything unseen for fifteen minutes is
 * deleted by the next write. There is no cron, and there is no growing
 * table that could be read as one person's browsing history — by the time
 * anyone looked, it would be gone.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

/** A visit unseen for this long is over, as far as this table is aware. */
export const LIVE_VISIT_TTL_MS = 15 * 60 * 1000;

/**
 * Generated once per process when ANALYTICS_SALT is unset — see the header
 * for why that is the right way round.
 */
const fallbackSalt = randomBytes(32).toString("hex");

function salt(): string {
  return process.env.ANALYTICS_SALT?.trim() || fallbackSalt;
}

/**
 * One-way, and salted so the low entropy of the inputs does not matter.
 *
 * Exported for its test, which is really a test of the property that
 * matters: the same visitor hashes the same way, a different one does not,
 * and neither hash contains the address it came from.
 */
export function visitHash(ip: string, userAgent: string): string {
  return createHash("sha256").update(`${salt()}:${ip}:${userAgent}`).digest("hex").slice(0, 32);
}

export type LiveVisitRow = {
  path: string;
  locale: string;
  startedAt: Date;
  lastSeenAt: Date;
  dwellMs: number;
};

/**
 * Record that this visit is on this page, and sweep away the dead.
 *
 * The sweep runs on the write rather than on a schedule because the only
 * moment the table is worth tidying is the moment it is being read from or
 * added to, and a cron for a fifteen-minute window would be a scheduled job
 * to delete at most a handful of rows.
 */
export async function recordLiveVisit(params: {
  hash: string;
  path: string;
  locale: string;
  dwellMs: number;
}): Promise<void> {
  const cutoff = new Date(Date.now() - LIVE_VISIT_TTL_MS);

  await prisma.$transaction([
    prisma.liveVisit.deleteMany({ where: { lastSeenAt: { lt: cutoff } } }),
    prisma.liveVisit.upsert({
      where: { visitHash: params.hash },
      create: {
        visitHash: params.hash,
        path: params.path,
        locale: params.locale,
        dwellMs: params.dwellMs,
      },
      // startedAt is deliberately not touched: it is when this visit began,
      // not when it reached this page, so "on the site for 6 minutes" keeps
      // counting across a navigation.
      update: { path: params.path, locale: params.locale, dwellMs: params.dwellMs, lastSeenAt: new Date() },
    }),
  ]);
}

export type LiveSnapshot = {
  /** Visits seen inside the window. */
  activeCount: number;
  /** Most-read first. */
  pages: { path: string; count: number; medianDwellMs: number }[];
  byLocale: { locale: string; count: number }[];
  /** Newest first — what the activity feed renders. */
  visits: LiveVisitRow[];
};

export const EMPTY_SNAPSHOT: LiveSnapshot = {
  activeCount: 0,
  pages: [],
  byLocale: [],
  visits: [],
};

/**
 * Everything the realtime tab shows, from one query.
 *
 * Filtered by the window rather than trusting the sweep: a site with no
 * traffic performs no writes, so nothing sweeps, and without this filter a
 * quiet morning would show last night's visitors as present.
 */
export async function getLiveSnapshot(): Promise<LiveSnapshot> {
  const cutoff = new Date(Date.now() - LIVE_VISIT_TTL_MS);

  const rows = await prisma.liveVisit.findMany({
    where: { lastSeenAt: { gte: cutoff } },
    select: { path: true, locale: true, startedAt: true, lastSeenAt: true, dwellMs: true },
    orderBy: { lastSeenAt: "desc" },
    // A page showing "who is here now" does not need the 4,000th visitor,
    // and an unbounded read is how a quiet endpoint becomes a slow one on
    // the one day it matters.
    take: 500,
  });

  return summariseVisits(rows);
}

/** The arithmetic, separated so it can be tested without a database. */
export function summariseVisits(rows: readonly LiveVisitRow[]): LiveSnapshot {
  const byPath = new Map<string, number[]>();
  const byLocale = new Map<string, number>();

  for (const row of rows) {
    const dwells = byPath.get(row.path);
    if (dwells) dwells.push(row.dwellMs);
    else byPath.set(row.path, [row.dwellMs]);

    byLocale.set(row.locale, (byLocale.get(row.locale) ?? 0) + 1);
  }

  const pages = [...byPath.entries()]
    .map(([path, dwells]) => ({ path, count: dwells.length, medianDwellMs: median(dwells) }))
    .sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));

  return {
    activeCount: rows.length,
    pages,
    byLocale: [...byLocale.entries()]
      .map(([locale, count]) => ({ locale, count }))
      .sort((a, b) => b.count - a.count || a.locale.localeCompare(b.locale)),
    visits: [...rows],
  };
}

/** Median, not mean: one tab left open overnight would drag an average
 *  into uselessness, and this number is read as "how long people stay". */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/**
 * What crosses to the browser.
 *
 * Plain numbers rather than Dates: they do not survive the round trip
 * usefully, and the panel only ever renders "how long ago" anyway. It lives
 * here rather than beside the server action because a "use server" module
 * may export nothing but async functions — every export of one becomes a
 * server action — and this is a pure shape conversion.
 */
export type LiveSnapshotDto = {
  activeCount: number;
  pages: { path: string; count: number; medianDwellMs: number }[];
  byLocale: { locale: string; count: number }[];
  visits: {
    path: string;
    locale: string;
    /** Milliseconds since this visit began, at the moment of the read. */
    ageMs: number;
    /** Milliseconds since it was last seen. */
    idleMs: number;
    dwellMs: number;
  }[];
};

/** `now` is a parameter so a test can pin it — an age computed from the
 *  wrong end of the subtraction looks plausible and is always negative. */
export function toDto(snapshot: LiveSnapshot, now: number = Date.now()): LiveSnapshotDto {
  return {
    activeCount: snapshot.activeCount,
    pages: snapshot.pages,
    byLocale: snapshot.byLocale,
    visits: snapshot.visits.map((visit) => ({
      path: visit.path,
      locale: visit.locale,
      ageMs: Math.max(0, now - visit.startedAt.getTime()),
      idleMs: Math.max(0, now - visit.lastSeenAt.getTime()),
      dwellMs: visit.dwellMs,
    })),
  };
}
