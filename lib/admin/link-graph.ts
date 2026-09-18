import "server-only";

/**
 * lib/admin/link-graph.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Populates ContentLink — until Phase 4's content-link-scan.ts (this file's
 * predecessor, renamed here to match the schema comment's own naming), that
 * table existed with a doc-comment claiming a scan kept it current, but
 * nothing anywhere actually wrote to it. This is that scan, run on demand
 * from the keyword library page and the new /admin/seo/links page (not a
 * cron job) so a topic cluster's pillar-page pick, and this file's own
 * orphan/opportunity screens, are never staler than the admin's last click
 * of "Rescan links".
 *
 * Walks the same five published-content queries lib/admin/url-health.ts's
 * own broken-link scan already runs (news/faq/project/event/hero-slide) —
 * published-only, since a still-draft page's outbound links shouldn't
 * count toward another page's authority before anyone can even reach it —
 * and reuses lib/content-stats.ts's extractCheckableLinks() (already
 * dual-format Markdown/HTML tolerant, already used this exact way by the
 * editor's own Links tab) rather than writing a second link-parsing pass.
 *
 * Full delete-then-reinsert on every scan, not a diff/upsert: ContentLink
 * has exactly one scan writer, and a run already re-visits every published
 * page regardless, so there is no cheaper correct partial update to make —
 * a diff would only add bookkeeping for no benefit.
 *
 * External HTTP status checking is a second, independent export
 * (checkExternalLinkStatuses) wired to its own separate button, never run
 * as part of a rescan — matching url-health.ts's own explicit rule that
 * loading this admin data must never depend on an external site's
 * availability or speed. Rescanning stays instant; checking external
 * links is the one operation here allowed to be slow or occasionally fail.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import { extractCheckableLinks } from "@/lib/content-stats";
import { stripLocale } from "@/lib/public-paths";
import type { PublishableType } from "@/lib/content-revisions";
import type { Prisma } from "@prisma/client";

export type ContentLinkScanResult = {
  scannedAt: Date;
  pagesScanned: number;
  linksWritten: number;
};

/** A fifth and sixth "content type" for ContentLink.fromType — neither Faq
 *  nor HeroStorySlide is a PublishableType (they have no individual public
 *  page of their own, so they can never be an orphan-detection *target*),
 *  but both are real link *sources*, the same as url-health.ts's own scan
 *  already treats them. */
export type LinkSourceType = PublishableType | "FAQ" | "HERO_SLIDE";

/** Prisma.createMany has no practical row limit, but chunking keeps any
 *  one statement small and matches this codebase's existing CSV-import
 *  batching style (see importUnitsCsv). */
const CHUNK_SIZE = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

type PendingLink = Prisma.ContentLinkCreateManyInput;

function collectLinks(
  fromType: LinkSourceType,
  fromId: string,
  fromLocale: string,
  bodies: (string | null)[],
  scannedAt: Date,
  out: PendingLink[],
): void {
  for (const body of bodies) {
    if (!body) continue;
    for (const link of extractCheckableLinks(body)) {
      out.push({
        fromType,
        fromId,
        fromLocale,
        toPath: link.internal ? stripLocale(link.target) : link.target,
        anchorText: null,
        isInternal: link.internal,
        checkedAt: scannedAt,
        httpStatus: null,
      });
    }
  }
}

export async function scanAndPersistLinkGraph(): Promise<ContentLinkScanResult> {
  const scannedAt = new Date();

  // Carried forward below: a rescan discovers the same external links
  // fresh every time (full delete-then-reinsert, see this file's header),
  // which would otherwise silently erase every httpStatus/checkedAt the
  // last "Check external links" run recorded — even when nothing about
  // that link actually changed. Keyed on the exact (source, target) tuple
  // so a link that moved to a different source, or a genuinely new link,
  // still starts unchecked rather than inheriting a stale answer.
  const previousExternalStatuses = new Map<string, { httpStatus: number; checkedAt: Date }>();
  for (const row of await prisma.contentLink.findMany({
    where: { isInternal: false, httpStatus: { not: null } },
    select: { fromType: true, fromId: true, fromLocale: true, toPath: true, httpStatus: true, checkedAt: true },
  })) {
    previousExternalStatuses.set(`${row.fromType}:${row.fromId}:${row.fromLocale}:${row.toPath}`, {
      httpStatus: row.httpStatus as number,
      checkedAt: row.checkedAt as Date,
    });
  }

  const [articles, projects, events, faqs, slides] = await Promise.all([
    prisma.newsArticle.findMany({
      where: { isPublished: true },
      select: { id: true, translations: { select: { locale: true, content: true } } },
    }),
    prisma.project.findMany({
      where: { isPublished: true, deletedAt: null },
      select: {
        id: true,
        translations: { select: { locale: true, description: true, conceptDesign: true, aboutThisProject: true } },
      },
    }),
    prisma.event.findMany({
      where: { isPublished: true },
      select: { id: true, translations: { select: { locale: true, description: true } } },
    }),
    prisma.faq.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        answerEn: true,
        answerTh: true,
        translations: { select: { locale: true, answer: true } },
      },
    }),
    prisma.heroStorySlide.findMany({
      where: { isActive: true },
      select: { id: true, ctaUrl: true, mediaUrl: true },
    }),
  ]);

  const links: PendingLink[] = [];
  let pagesScanned = 0;

  for (const article of articles) {
    for (const translation of article.translations) {
      pagesScanned += 1;
      collectLinks("NEWS_ARTICLE", article.id, translation.locale, [translation.content], scannedAt, links);
    }
  }

  for (const project of projects) {
    for (const translation of project.translations) {
      pagesScanned += 1;
      collectLinks(
        "PROJECT",
        project.id,
        translation.locale,
        [translation.description, translation.conceptDesign, translation.aboutThisProject],
        scannedAt,
        links,
      );
    }
  }

  for (const event of events) {
    for (const translation of event.translations) {
      pagesScanned += 1;
      collectLinks("EVENT", event.id, translation.locale, [translation.description], scannedAt, links);
    }
  }

  // FAQ has no individually addressable public page (it renders inline on
  // whichever project page embeds it), so it is a link source only, never
  // scanned for its own inbound links or reported as an orphan.
  for (const faq of faqs) {
    pagesScanned += 1;
    collectLinks("FAQ", faq.id, "en", [faq.answerEn], scannedAt, links);
    collectLinks("FAQ", faq.id, "th", [faq.answerTh], scannedAt, links);
    for (const translation of faq.translations) {
      collectLinks("FAQ", faq.id, translation.locale, [translation.answer], scannedAt, links);
    }
  }

  // Same reasoning for HeroStorySlide — a homepage section, not its own
  // page. ctaUrl/mediaUrl are row-level, not translated, so "en" is a
  // placeholder locale rather than a real one.
  for (const slide of slides) {
    pagesScanned += 1;
    if (slide.ctaUrl) collectLinks("HERO_SLIDE", slide.id, "en", [slide.ctaUrl], scannedAt, links);
    collectLinks("HERO_SLIDE", slide.id, "en", [slide.mediaUrl], scannedAt, links);
  }

  for (const link of links) {
    if (link.isInternal) continue;
    const previous = previousExternalStatuses.get(`${link.fromType}:${link.fromId}:${link.fromLocale}:${link.toPath}`);
    if (previous) {
      link.httpStatus = previous.httpStatus;
      link.checkedAt = previous.checkedAt;
    }
  }

  await prisma.$transaction([
    prisma.contentLink.deleteMany({}),
    ...chunk(links, CHUNK_SIZE).map((batch) => prisma.contentLink.createMany({ data: batch })),
  ]);

  return { scannedAt, pagesScanned, linksWritten: links.length };
}

// ── External link status checking ──────────────────────────────────────

export type ExternalLinkCheckResult = {
  checkedAt: Date;
  urlsChecked: number;
  rowsUpdated: number;
};

/** Same deadline seo-check.ts's own request() uses for an outbound fetch. */
const EXTERNAL_CHECK_TIMEOUT_MS = 8_000;

/** No existing precedent to match (url-health.ts deliberately never makes
 *  a network call at all) — a small, defensible cap. This site's realistic
 *  external-link count is dozens, not thousands, so no per-host throttling
 *  or queue is worth building for that scale. */
const EXTERNAL_CHECK_CONCURRENCY = 5;

/** Same numbers as app/api/validate-email/route.ts's MX cache. */
const CACHE_TTL_MS = 60 * 60_000;
const CACHE_MAX_ENTRIES = 2_000;

type CachedStatus = { httpStatus: number; checkedAt: number };

/** Keyed on the full URL, not host — unlike an MX lookup, HTTP health is
 *  per-page, not per-domain. Module-level, so it survives across requests
 *  within one server process but not a restart — an acceptable cost for
 *  what is already a manually-triggered, best-effort check. */
const statusCache = new Map<string, CachedStatus>();

/** `limit` workers pull from a shared cursor until the queue empties. No
 *  existing concurrency-limiter precedent in this codebase and no new
 *  dependency, matching its preference for small hand-rolled utilities
 *  over a library for something this short. */
export async function runWithLimit<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

/** HEAD first; a 405/501 (method not allowed / not implemented) retries
 *  once with GET, since some servers reject HEAD outright. Any network
 *  failure or timeout resolves to 0, never throws — matching seo-check.ts's
 *  own status:0 sentinel, so one bad link never kills a batch of a
 *  hundred. */
async function probe(url: string): Promise<number> {
  const attempt = async (method: "HEAD" | "GET"): Promise<number> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXTERNAL_CHECK_TIMEOUT_MS);
    try {
      const response = await fetch(url, { method, signal: controller.signal, redirect: "follow" });
      return response.status;
    } catch {
      return 0;
    } finally {
      clearTimeout(timer);
    }
  };

  const headStatus = await attempt("HEAD");
  if (headStatus === 405 || headStatus === 501) return attempt("GET");
  return headStatus;
}

/** Checks every distinct external URL currently recorded in ContentLink
 *  and writes the result back onto every row sharing that URL. A separate
 *  operation from scanAndPersistLinkGraph — see this file's header. */
export async function checkExternalLinkStatuses(): Promise<ExternalLinkCheckResult> {
  const rows = await prisma.contentLink.findMany({
    where: { isInternal: false },
    select: { toPath: true },
    distinct: ["toPath"],
  });

  const results = await runWithLimit(
    rows.map((row) => row.toPath),
    EXTERNAL_CHECK_CONCURRENCY,
    async (url): Promise<{ url: string; httpStatus: number; checkedAt: number }> => {
      const cached = statusCache.get(url);
      if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) return { url, ...cached };

      const httpStatus = await probe(url);
      const checkedAt = Date.now();

      // Only a definite answer (any real response, even a 404/500) is
      // cached — a timeout/DNS failure (status 0) never is, so a
      // transient blip can't brand a URL "broken" for the next hour. Same
      // rule validate-email's MX cache already uses, for the same reason.
      if (httpStatus !== 0) {
        if (statusCache.size >= CACHE_MAX_ENTRIES) {
          const oldest = statusCache.keys().next().value;
          if (oldest !== undefined) statusCache.delete(oldest);
        }
        statusCache.set(url, { httpStatus, checkedAt });
      }

      return { url, httpStatus, checkedAt };
    },
  );

  await prisma.$transaction(
    results.map((result) =>
      prisma.contentLink.updateMany({
        where: { isInternal: false, toPath: result.url },
        data: { httpStatus: result.httpStatus, checkedAt: new Date(result.checkedAt) },
      }),
    ),
  );

  return { checkedAt: new Date(), urlsChecked: rows.length, rowsUpdated: results.length };
}
