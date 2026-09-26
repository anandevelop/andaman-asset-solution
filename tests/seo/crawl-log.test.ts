/**
 * tests/seo/crawl-log.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The buffer that keeps crawl logging off the visitor's request path.
 *
 * The write itself needs a database and is exercised in the browser pass.
 * What is worth pinning here is the part that decides *whether* a request
 * pays for anything: a burst of crawler hits must collapse into one
 * bucket, a visitor's request must never be handed a promise to wait on
 * unless the buffer is genuinely due, and two requests finding it due at
 * the same moment must not write the same counts twice.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: { crawlHit: { upsert: vi.fn().mockResolvedValue({}) } },
}));

import { prisma } from "@/lib/prisma";
import {
  bufferedCrawlHits,
  flushCrawlHits,
  recordCrawlHit,
  resetCrawlBuffer,
  startOfUtcHour,
} from "@/lib/seo/crawl-log";

const upsert = prisma.crawlHit.upsert as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetCrawlBuffer();
  upsert.mockClear();
});

const t0 = new Date("2026-09-26T14:17:03Z");

describe("recordCrawlHit", () => {
  it("returns nothing to wait on for an ordinary hit", () => {
    // The point of the whole design: a crawler's request costs a Map
    // insert, and proxy.ts has no promise to hand to waitUntil.
    expect(recordCrawlHit({ bot: "googlebot", path: "/projects" }, t0)).toBeNull();
  });

  it("collapses a burst into one bucket", () => {
    for (let i = 0; i < 50; i += 1) {
      recordCrawlHit({ bot: "googlebot", path: "/projects" }, t0);
    }

    const buffered = bufferedCrawlHits();
    expect(buffered).toHaveLength(1);
    expect(buffered[0].hits).toBe(50);
  });

  it("keeps different bots, paths and hours apart", () => {
    /* Straddling an hour boundary rather than spanning one: thirty
       seconds apart keeps the buffer under its age limit, so what is
       asserted is the bucketing and not the flush. */
    const before = new Date("2026-09-26T13:59:40Z");
    const after = new Date("2026-09-26T14:00:10Z");

    recordCrawlHit({ bot: "googlebot", path: "/projects" }, before);
    recordCrawlHit({ bot: "bingbot", path: "/projects" }, before);
    recordCrawlHit({ bot: "googlebot", path: "/news" }, before);
    recordCrawlHit({ bot: "googlebot", path: "/projects" }, after);

    expect(bufferedCrawlHits()).toHaveLength(4);
  });

  it("keeps a 404 apart from a hit on the same path", () => {
    // A redirect added midway through an hour produces both, and adding
    // them together would hide the broken half.
    recordCrawlHit({ bot: "googlebot", path: "/gone" }, t0);
    recordCrawlHit({ bot: "googlebot", path: "/gone", notFound: true }, t0);

    const buffered = bufferedCrawlHits();
    expect(buffered).toHaveLength(2);
    expect(buffered.map((b) => b.notFound).sort()).toEqual([false, true]);
  });

  it("buckets by the hour, not the minute", () => {
    recordCrawlHit({ bot: "googlebot", path: "/projects" }, new Date("2026-09-26T14:00:01Z"));
    recordCrawlHit({ bot: "googlebot", path: "/projects" }, new Date("2026-09-26T14:00:31Z"));

    const buffered = bufferedCrawlHits();
    expect(buffered).toHaveLength(1);
    expect(buffered[0].hour.toISOString()).toBe("2026-09-26T14:00:00.000Z");
  });

  it("becomes due once the buffer is old enough", () => {
    expect(recordCrawlHit({ bot: "googlebot", path: "/a" }, t0)).toBeNull();

    // A minute later, the same buffer is due — and the caller is handed a
    // promise for waitUntil rather than being made to wait on it.
    const due = recordCrawlHit(
      { bot: "googlebot", path: "/b" },
      new Date(t0.getTime() + 60_000),
    );
    expect(due).toBeInstanceOf(Promise);
  });

  it("becomes due once too many buckets are waiting", async () => {
    let due: Promise<void> | null = null;

    for (let i = 0; i < 500 && !due; i += 1) {
      due = recordCrawlHit({ bot: "googlebot", path: `/page-${i}` }, t0);
    }

    // A crawler walking thousands of new paths in a minute must not grow
    // the buffer without bound.
    expect(due).toBeInstanceOf(Promise);
    await due;
  });
});

describe("flushCrawlHits", () => {
  it("writes one increment per bucket and empties the buffer", async () => {
    recordCrawlHit({ bot: "googlebot", path: "/projects" }, t0);
    recordCrawlHit({ bot: "googlebot", path: "/projects" }, t0);
    recordCrawlHit({ bot: "bingbot", path: "/news" }, t0);

    await flushCrawlHits();

    expect(upsert).toHaveBeenCalledTimes(2);
    expect(bufferedCrawlHits()).toHaveLength(0);

    const projects = upsert.mock.calls.find(
      (call) => call[0].where.bot_path_hour_notFound.path === "/projects",
    )![0];

    // An increment, not a set: the same hour is written again on the next
    // flush and the counts have to add up.
    expect(projects.update).toEqual({ hits: { increment: 2 } });
    expect(projects.create.hits).toBe(2);
  });

  it("does not write the same counts twice when two requests both flush", async () => {
    recordCrawlHit({ bot: "googlebot", path: "/projects" }, t0);

    // Both callers find the buffer due in the same tick. The second must
    // join the first rather than write an empty — or worse, a duplicate —
    // batch.
    const [a, b] = [flushCrawlHits(), flushCrawlHits()];
    await Promise.all([a, b]);

    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when there is nothing buffered", async () => {
    await flushCrawlHits();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("never throws when the database refuses", async () => {
    // This runs after the response has been sent. A crawl statistic is not
    // worth an unhandled rejection anywhere.
    upsert.mockRejectedValueOnce(new Error("connection refused"));
    recordCrawlHit({ bot: "googlebot", path: "/projects" }, t0);

    await expect(flushCrawlHits()).resolves.toBeUndefined();
  });
});

describe("startOfUtcHour", () => {
  it("floors to the hour in UTC, not local time", () => {
    // Asia/Bangkok is UTC+7; a local-hour boundary would put the same
    // crawl in a different bucket depending on where the container runs.
    expect(startOfUtcHour(new Date("2026-09-26T14:59:59.999Z")).toISOString()).toBe(
      "2026-09-26T14:00:00.000Z",
    );
    expect(startOfUtcHour(new Date("2026-09-26T00:00:00Z")).toISOString()).toBe(
      "2026-09-26T00:00:00.000Z",
    );
  });
});
