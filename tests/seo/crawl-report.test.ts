/**
 * tests/seo/crawl-report.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The arithmetic behind the indexing tab.
 *
 * The bug this file was written for: a crawler's 404 is recorded twice, by
 * two different writers, because proxy.ts runs before routing and cannot
 * know the status while the catch-all route can. Adding the two rows
 * together reports one crawler request as two — and only for the broken
 * paths, so the inflation lands exactly where somebody is trying to judge
 * how bad a problem is.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    crawlHit: { findMany: vi.fn(), count: vi.fn() },
    seoUrlState: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({
  safeQuery: async (_label: string, run: () => Promise<unknown>) => run(),
}));

import { prisma } from "@/lib/prisma";
import { getCrawlOverview } from "@/lib/seo/crawl-report";

const findMany = prisma.crawlHit.findMany as unknown as ReturnType<typeof vi.fn>;
const count = prisma.crawlHit.count as unknown as ReturnType<typeof vi.fn>;
const urlStates = prisma.seoUrlState.findMany as unknown as ReturnType<typeof vi.fn>;

const hour = new Date("2026-09-26T12:00:00Z");

function setup(
  rows: { bot: string; path: string; hits: number; notFound: boolean; hour?: Date }[],
  urls: string[] = [],
) {
  findMany.mockResolvedValue(rows.map((row) => ({ ...row, hour: row.hour ?? hour })));
  count.mockResolvedValue(rows.length);
  urlStates.mockResolvedValue(urls.map((url) => ({ url })));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("crawler activity", () => {
  it("counts a 404 once, not twice", async () => {
    // What one Googlebot request for a dead path actually writes: the
    // proxy's row, then the catch-all's.
    setup([
      { bot: "googlebot", path: "/gone", hits: 1, notFound: false },
      { bot: "googlebot", path: "/gone", hits: 1, notFound: true },
    ]);

    const [google] = (await getCrawlOverview()).activity;

    expect(google.hits).toBe(1);
    expect(google.notFound).toBe(1);
    expect(google.paths).toBe(1);
  });

  it("keeps 404s as a subset of requests, never added on top", async () => {
    setup([
      { bot: "googlebot", path: "/projects", hits: 40, notFound: false },
      { bot: "googlebot", path: "/gone", hits: 10, notFound: false },
      { bot: "googlebot", path: "/gone", hits: 10, notFound: true },
    ]);

    const [google] = (await getCrawlOverview()).activity;

    expect(google.hits).toBe(50);
    expect(google.notFound).toBe(10);
    expect(google.notFound).toBeLessThanOrEqual(google.hits);
  });

  it("sorts the busiest crawler first", async () => {
    setup([
      { bot: "bingbot", path: "/a", hits: 5, notFound: false },
      { bot: "googlebot", path: "/a", hits: 90, notFound: false },
      { bot: "ahrefsbot", path: "/a", hits: 20, notFound: false },
    ]);

    expect((await getCrawlOverview()).activity.map((row) => row.bot)).toEqual([
      "googlebot",
      "ahrefsbot",
      "bingbot",
    ]);
  });
});

describe("the funnel", () => {
  it("counts only pages the site actually publishes as crawled", async () => {
    // A crawler probing /wp-login.php has crawled something, but letting it
    // count would make the funnel look healthier the more the site is
    // probed.
    setup(
      [
        { bot: "googlebot", path: "/projects", hits: 3, notFound: false },
        { bot: "googlebot", path: "/wp-login.php", hits: 80, notFound: false },
      ],
      ["https://example.com/th/projects", "https://example.com/th/news"],
    );

    const { funnel } = await getCrawlOverview();

    expect(funnel.known).toBe(2);
    expect(funnel.crawled).toBe(1);
  });

  it("reads the paths the audit actually stores, not only absolute URLs", async () => {
    /*
      SeoUrlState.url holds "/en/projects" despite its name. Running those
      through new URL() throws, and the first version of this caught the
      throw and returned null for every row — so the funnel reported a site
      with no pages, silently.
    */
    setup(
      [{ bot: "googlebot", path: "/projects", hits: 4, notFound: false }],
      ["/en/projects", "/th/projects", "/en/about"],
    );

    const { funnel } = await getCrawlOverview();

    // /en/projects and /th/projects are one page in two languages.
    expect(funnel.known).toBe(2);
    expect(funnel.crawled).toBe(1);
  });

  it("does not count a scraper as having crawled anything", async () => {
    // Ahrefs fetching a page says nothing about whether Google can find it.
    setup(
      [{ bot: "ahrefsbot", path: "/projects", hits: 30, notFound: false }],
      ["https://example.com/th/projects"],
    );

    expect((await getCrawlOverview()).funnel.crawled).toBe(0);
  });

  it("reports the Google-dependent steps as unavailable, never as zero", async () => {
    // Two zero bars would read as "Google has indexed nothing of ours".
    setup([{ bot: "googlebot", path: "/projects", hits: 1, notFound: false }]);

    const { funnel } = await getCrawlOverview();
    expect(funnel.indexed).toEqual({ available: false, reason: "google" });
    expect(funnel.earning).toEqual({ available: false, reason: "google" });
  });
});

describe("dead ends and gaps", () => {
  it("lists every crawler that found the same dead end", async () => {
    setup([
      { bot: "googlebot", path: "/gone", hits: 3, notFound: true },
      { bot: "bingbot", path: "/gone", hits: 1, notFound: true },
    ]);

    const [row] = (await getCrawlOverview()).notFound;
    expect(row.path).toBe("/gone");
    expect(row.hits).toBe(4);
    expect(row.bots).toEqual(["bingbot", "googlebot"]);
  });

  it("names the published pages no search crawler has fetched", async () => {
    setup(
      [{ bot: "googlebot", path: "/projects", hits: 2, notFound: false }],
      [
        "https://example.com/th/projects",
        "https://example.com/th/news",
        "https://example.com/th/contact",
      ],
    );

    expect((await getCrawlOverview()).uncrawled).toEqual(["/contact", "/news"]);
  });

  it("tells 'nothing logged yet' apart from 'nobody came this week'", async () => {
    setup([]);
    count.mockResolvedValue(0);
    expect((await getCrawlOverview()).empty).toBe(true);

    setup([]);
    count.mockResolvedValue(120);
    expect((await getCrawlOverview()).empty).toBe(false);
  });
});
