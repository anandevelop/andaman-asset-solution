/**
 * lib/seo/crawl-log.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Recording that a crawler fetched a path, without making a visitor wait.
 *
 * WHERE THIS RUNS
 *
 * From proxy.ts, which in Next 16 is a Node.js module — the rename from
 * middleware.ts came with the runtime change, and the older advice that
 * Prisma cannot be reached from there no longer holds. What still holds is
 * that proxy.ts is on the request path of every visitor, so the write is
 * handed to `event.waitUntil()` and happens after the response has gone
 * out. Nothing here is ever awaited before a response.
 *
 * WHY IT IS BUFFERED
 *
 * A crawler fetches in bursts — a few hundred requests in a minute, all
 * landing in the same hourly bucket. One upsert per request would be a few
 * hundred round trips to write a number that only needs writing once, and
 * every one of them holds a connection from the same pool the visitor's
 * page render is drawing from.
 *
 * So hits accumulate in a Map and are flushed when the buffer is old
 * enough or large enough. The counters are increments, so two instances
 * flushing the same bucket add up correctly rather than overwriting each
 * other.
 *
 * WHAT IS LOST ON A RESTART
 *
 * Whatever is still in the buffer — at most one flush interval of crawl
 * counts. That is the right thing to lose: this is a trend, not a ledger,
 * and the alternative costs a write on the visitor's request path to avoid
 * losing a number nobody will miss.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { isDatabaseOfflineError } from "@/lib/db";

/** Flush when the oldest buffered hit is this old. */
const MAX_AGE_MS = 60_000;

/** …or when this many distinct buckets are waiting, whichever comes first.
 *  A cap rather than a target: it bounds memory if a crawler walks
 *  thousands of paths in a minute. */
const MAX_BUCKETS = 500;

type Bucket = { bot: string; path: string; hour: Date; notFound: boolean; hits: number };

const buffer = new Map<string, Bucket>();
let oldestAt: number | null = null;
let flushing: Promise<void> | null = null;

function keyOf(bot: string, path: string, hour: Date, notFound: boolean): string {
  return `${bot}\u0000${path}\u0000${hour.toISOString()}\u0000${notFound}`;
}

export function startOfUtcHour(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()),
  );
}

/**
 * Note one crawler visit. Returns a promise only when the buffer is due to
 * be written, so the caller can hand *that* to waitUntil and nothing else.
 */
export function recordCrawlHit(
  input: { bot: string; path: string; notFound?: boolean },
  now: Date = new Date(),
): Promise<void> | null {
  const hour = startOfUtcHour(now);
  const notFound = input.notFound ?? false;
  const key = keyOf(input.bot, input.path, hour, notFound);

  const existing = buffer.get(key);
  if (existing) existing.hits += 1;
  else buffer.set(key, { bot: input.bot, path: input.path, hour, notFound, hits: 1 });

  oldestAt ??= now.getTime();

  const due = now.getTime() - oldestAt >= MAX_AGE_MS || buffer.size >= MAX_BUCKETS;
  return due ? flushCrawlHits() : null;
}

/**
 * Write what is buffered.
 *
 * Re-entrant by design: two requests can both find the buffer due at the
 * same moment, and the second must not write the same counts again. The
 * in-flight promise is shared instead.
 */
export function flushCrawlHits(): Promise<void> {
  if (flushing) return flushing;

  const pending = [...buffer.values()];
  buffer.clear();
  oldestAt = null;

  if (pending.length === 0) return Promise.resolve();

  flushing = write(pending).finally(() => {
    flushing = null;
  });

  return flushing;
}

async function write(pending: readonly Bucket[]): Promise<void> {
  try {
    /*
      One upsert per bucket, incrementing. Not createMany: the same
      (bot, path, hour) is written again on the next flush an hour has not
      turned over, and the counts have to add up rather than collide on the
      unique key.
    */
    await Promise.all(
      pending.map((bucket) =>
        prisma.crawlHit.upsert({
          where: {
            bot_path_hour_notFound: {
              bot: bucket.bot,
              path: bucket.path,
              hour: bucket.hour,
              notFound: bucket.notFound,
            },
          },
          create: { ...bucket },
          update: { hits: { increment: bucket.hits } },
        }),
      ),
    );
  } catch (error) {
    // Never anybody's problem: this runs after the response has been sent,
    // and a crawl statistic is not worth an error anywhere.
    if (!isDatabaseOfflineError(error)) {
      console.error("[crawl] failed to write", error);
    }
  }
}

/** Test seam: the buffer is module state and a test must be able to start
 *  from a known one. */
export function resetCrawlBuffer(): void {
  buffer.clear();
  oldestAt = null;
  flushing = null;
}

/** Test seam: what is waiting, without writing it. */
export function bufferedCrawlHits(): Bucket[] {
  return [...buffer.values()];
}
