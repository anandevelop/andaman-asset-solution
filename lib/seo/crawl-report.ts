/**
 * lib/seo/crawl-report.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What the indexing tab reads.
 *
 * THE FUNNEL STOPS WHERE THE EVIDENCE STOPS
 *
 * sitemap → crawled → indexed → earning impressions is the shape everybody
 * draws. This deployment can answer the first two from its own logs and
 * neither of the last two: "indexed" comes from URL Inspection and
 * "impressions" from Search Console, both phase 4. Those steps are
 * returned as unavailable rather than as zero, because a funnel that ends
 * in two empty bars reads as "Google has indexed nothing of ours", which
 * would be alarming and false.
 *
 * "CRAWLED" MEANS A SEARCH CRAWLER
 *
 * Ahrefs and GPTBot fetching a page says nothing about whether it can be
 * found on Google. They are counted, and shown, under their own names —
 * just not in the step that is about search.
 *
 * Every read goes through safeQuery: an admin screen should empty rather
 * than 500 when Postgres blinks.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { SEARCH_BOTS, type BotName } from "@/lib/seo/bots";

export type Unavailable = { available: false; reason: "google" };

const UNAVAILABLE: Unavailable = { available: false, reason: "google" };

export type BotActivity = {
  bot: string;
  hits: number;
  /** Distinct paths this crawler asked for. */
  paths: number;
  notFound: number;
  lastSeen: Date;
};

export type CrawlFunnel = {
  /** URLs the audit knows the site publishes. */
  known: number;
  /** Of those, fetched by a search crawler in the window. */
  crawled: number;
  /** Phase 4 — URL Inspection. */
  indexed: Unavailable;
  /** Phase 4 — Search Console. */
  earning: Unavailable;
};

export type BotNotFound = {
  path: string;
  hits: number;
  bots: string[];
  lastSeen: Date;
};

export type CrawlOverview = {
  windowDays: number;
  activity: BotActivity[];
  funnel: CrawlFunnel;
  /** Dead ends a crawler found — invisible anywhere else in the admin. */
  notFound: BotNotFound[];
  /** Paths the audit knows about that no search crawler has asked for. */
  uncrawled: string[];
  /** True when nothing has ever been logged: a different state from "no
   *  crawler came this week". */
  empty: boolean;
};

export async function getCrawlOverview(windowDays = 30): Promise<CrawlOverview> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - windowDays);
  since.setUTCHours(0, 0, 0, 0);

  return safeQuery(
    "seo:crawl",
    async () => {
      const [rows, everAny, knownUrls] = await Promise.all([
        prisma.crawlHit.findMany({
          where: { hour: { gte: since } },
          select: { bot: true, path: true, hits: true, notFound: true, hour: true },
        }),
        prisma.crawlHit.count(),
        prisma.seoUrlState.findMany({ select: { url: true } }),
      ]);

      return {
        windowDays,
        activity: activityOf(rows),
        funnel: funnelOf(rows, knownUrls),
        notFound: notFoundOf(rows),
        uncrawled: uncrawledOf(rows, knownUrls),
        empty: everAny === 0,
      };
    },
    {
      windowDays,
      activity: [],
      funnel: { known: 0, crawled: 0, indexed: UNAVAILABLE, earning: UNAVAILABLE },
      notFound: [],
      uncrawled: [],
      empty: true,
    },
  );
}

type Row = { bot: string; path: string; hits: number; notFound: boolean; hour: Date };

function activityOf(rows: readonly Row[]): BotActivity[] {
  const byBot = new Map<string, { hits: number; paths: Set<string>; notFound: number; lastSeen: Date }>();

  /*
    A 404 is written twice — once by proxy.ts, which cannot know the status
    yet, and once by the catch-all route, which can. See the CrawlHit model.
    So "requests" is the notFound = false total and "404s" is the
    notFound = true total *within* it; adding the two would report one
    crawler request as two, and would do it only for the broken paths.
  */
  for (const row of rows) {
    const entry =
      byBot.get(row.bot) ?? { hits: 0, paths: new Set<string>(), notFound: 0, lastSeen: row.hour };

    if (row.notFound) entry.notFound += row.hits;
    else entry.hits += row.hits;

    entry.paths.add(row.path);
    if (row.hour > entry.lastSeen) entry.lastSeen = row.hour;

    byBot.set(row.bot, entry);
  }

  return [...byBot.entries()]
    .map(([bot, entry]) => ({
      bot,
      hits: entry.hits,
      paths: entry.paths.size,
      notFound: entry.notFound,
      lastSeen: entry.lastSeen,
    }))
    .sort((a, b) => b.hits - a.hits);
}

/**
 * The locale-stripped path an audit row refers to, for comparing against a
 * crawl log that stores paths that way.
 *
 * SeoUrlState.url holds a *path* — "/en/about" — despite the column's
 * name, which is what the audit enumerates and fetches relative to the
 * deployment's own origin. Absolute URLs are accepted too rather than
 * assumed absent: the first version of this function ran every row through
 * `new URL()`, which throws on a bare path, and the catch returned null for
 * all eighty of them. The funnel then reported that the site publishes no
 * pages at all, with no error anywhere.
 */
function pathOf(url: string): string | null {
  const pathname = url.startsWith("/") ? url : absolutePathOf(url);
  if (pathname === null) return null;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return null;

  // Drop the locale prefix every audited path carries.
  return `/${segments.slice(1).join("/")}`;
}

function absolutePathOf(url: string): string | null {
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

function knownPaths(knownUrls: readonly { url: string }[]): Set<string> {
  const paths = new Set<string>();
  for (const row of knownUrls) {
    const path = pathOf(row.url);
    if (path) paths.add(path);
  }
  return paths;
}

function crawledPaths(rows: readonly Row[]): Set<string> {
  const search = new Set<string>(SEARCH_BOTS as readonly string[]);
  const paths = new Set<string>();

  for (const row of rows) {
    if (!row.notFound && search.has(row.bot as BotName)) paths.add(row.path);
  }

  return paths;
}

function funnelOf(rows: readonly Row[], knownUrls: readonly { url: string }[]): CrawlFunnel {
  const known = knownPaths(knownUrls);
  const crawled = crawledPaths(rows);

  return {
    known: known.size,
    // Counted against what the site actually publishes: a crawler asking
    // for /wp-login.php has crawled something, but not a page of ours, and
    // letting it inflate this step would make the funnel look healthier
    // the more it is probed.
    crawled: [...crawled].filter((path) => known.has(path)).length,
    indexed: UNAVAILABLE,
    earning: UNAVAILABLE,
  };
}

function notFoundOf(rows: readonly Row[]): BotNotFound[] {
  const byPath = new Map<string, { hits: number; bots: Set<string>; lastSeen: Date }>();

  for (const row of rows) {
    if (!row.notFound) continue;

    const entry = byPath.get(row.path) ?? { hits: 0, bots: new Set<string>(), lastSeen: row.hour };
    entry.hits += row.hits;
    entry.bots.add(row.bot);
    if (row.hour > entry.lastSeen) entry.lastSeen = row.hour;

    byPath.set(row.path, entry);
  }

  return [...byPath.entries()]
    .map(([path, entry]) => ({
      path,
      hits: entry.hits,
      bots: [...entry.bots].sort(),
      lastSeen: entry.lastSeen,
    }))
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 50);
}

/**
 * Pages the site publishes that no search crawler has asked for.
 *
 * The most actionable list on the screen while phase 4 is missing: a page
 * Google has never fetched cannot be indexed, and that is knowable from
 * this deployment's own logs without any Google API at all.
 */
function uncrawledOf(rows: readonly Row[], knownUrls: readonly { url: string }[]): string[] {
  const crawled = crawledPaths(rows);

  return [...knownPaths(knownUrls)]
    .filter((path) => !crawled.has(path))
    .sort()
    .slice(0, 50);
}

/** Which crawlers have asked for these paths lately — the "who found it"
 *  column on the 404 worklist. */
export async function getBotsByPath(
  paths: readonly string[],
  windowDays = 30,
): Promise<Map<string, string[]>> {
  if (paths.length === 0) return new Map();

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - windowDays);

  return safeQuery(
    "seo:crawlByPath",
    async () => {
      const rows = await prisma.crawlHit.findMany({
        where: { path: { in: [...paths] }, hour: { gte: since } },
        select: { path: true, bot: true },
        distinct: ["path", "bot"],
      });

      const byPath = new Map<string, string[]>();
      for (const row of rows) {
        byPath.set(row.path, [...(byPath.get(row.path) ?? []), row.bot].sort());
      }

      return byPath;
    },
    new Map<string, string[]>(),
  );
}
