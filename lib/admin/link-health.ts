import "server-only";

/**
 * lib/admin/link-health.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The data behind /admin/seo/links: orphan pages, redirect chains, and the
 * KPI row above them. Broken links and external-link counts are not
 * recomputed here — they already live in lib/admin/url-health.ts's
 * getUrlHealth(), and this file calls that rather than re-deriving the
 * same scan a second way (the phase's own "don't duplicate url-health.ts"
 * instruction). Same "load tables, compute in memory" shape as
 * lib/admin/keyword-library.ts.
 *
 * ORPHAN SCOPE
 *
 * Scoped to published Project/NewsArticle/Event — the three content types
 * this whole initiative treats as having an individually-tracked identity
 * (a ContentLink fromType/toPath, a KeywordAssignment contentType). Faq and
 * HeroStorySlide are link *sources* (see lib/admin/link-graph.ts) but have
 * no individually addressable public page of their own, so neither can
 * ever be "orphaned" in the sense this screen means. SYSTEM_PATHS (privacy,
 * terms) is still excluded as a small allowlist, even though the
 * Project/NewsArticle/Event scoping already makes it belt-and-suspenders
 * rather than load-bearing today.
 *
 * REDIRECT CHAINS
 *
 * findRedirectChains() walks only from "roots" — a fromPath that is nobody
 * else's toPath — so a 3-hop chain is reported once, not once per node it
 * passes through. See lib/redirects.ts's walkRedirectChain() for why this
 * is a new, separate primitive from seo/urls/actions.ts's chainProblem(),
 * not a refactor of it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { getUrlHealth, type UrlHealth, type RedirectRow } from "@/lib/admin/url-health";
import { resolveContentRefs, resolveLinkSources, type ContentRef } from "@/lib/admin/content-link-index";
import { walkRedirectChain } from "@/lib/redirects";
import { SYSTEM_PATHS } from "@/lib/public-paths";

export type OrphanPage = {
  contentType: "PROJECT" | "NEWS_ARTICLE" | "EVENT";
  contentId: string;
  title: string;
  path: string;
  adminHref: string;
};

export type RedirectChainGroup = {
  /** The chain's own rows, root first, in walk order. */
  rows: RedirectRow[];
  terminal: string;
  loop: boolean;
};

export type LinkHealthKpis = {
  totalInternalLinks: number;
  orphanCount: number;
  /** urlHealth.brokenLinks.length + externalLinks.length — a broken
   *  internal reference and an unreachable external one are both "broken
   *  links" to this KPI, even though they come from two different checks
   *  (url-health.ts's own scan vs. lib/admin/link-graph.ts's HTTP probe). */
  brokenLinkCount: number;
  activeRedirectCount: number;
};

export type ExternalLinkStatus = {
  fromType: string;
  fromId: string;
  sourceLabel: string;
  adminHref: string | null;
  toPath: string;
  httpStatus: number;
  checkedAt: Date;
};

export type LinkHealth = {
  kpis: LinkHealthKpis;
  urlHealth: UrlHealth;
  orphans: OrphanPage[];
  chains: RedirectChainGroup[];
  /** Every checked (lib/admin/link-graph.ts's checkExternalLinkStatuses)
   *  external link whose last known status is not a plain 2xx/3xx — a 0
   *  (timeout/DNS failure/network error) counts as broken here too, same
   *  as a definite 404/500. Never includes an unchecked link (httpStatus
   *  still null): "not yet checked" and "checked and fine" are different
   *  facts, and only the latter is silently omitted. */
  externalLinks: ExternalLinkStatus[];
  /** When lib/admin/link-graph.ts's scan last ran. Only the timestamp is
   *  recoverable after the fact — a scanned page with no links in its body
   *  leaves no ContentLink row at all, so "pages scanned" can't be
   *  reconstructed from this table the way it's known at scan time. */
  lastScan: { scannedAt: Date } | null;
};

const ADMIN_HREF: Record<OrphanPage["contentType"], (id: string) => string> = {
  PROJECT: (id) => `/admin/projects/${id}/edit`,
  NEWS_ARTICLE: (id) => `/admin/news/${id}/edit`,
  EVENT: (id) => `/admin/events/${id}/edit`,
};

const EMPTY: LinkHealth = {
  kpis: { totalInternalLinks: 0, orphanCount: 0, brokenLinkCount: 0, activeRedirectCount: 0 },
  urlHealth: {
    redirects: [],
    notFound: [],
    hiddenCount: 0,
    brokenLinks: [],
    notFoundTotal: 0,
    externalLinkCount: 0,
    countingSince: null,
  },
  orphans: [],
  chains: [],
  externalLinks: [],
  lastScan: null,
};

/** Not a 2xx/3xx (or a 0 sentinel — see checkExternalLinkStatuses's own
 *  comment on why a timeout is never cached as fine). */
function isBrokenHttpStatus(status: number): boolean {
  return status === 0 || status < 200 || status >= 400;
}

async function findExternalLinkStatuses(): Promise<ExternalLinkStatus[]> {
  const rows = await prisma.contentLink.findMany({
    where: { isInternal: false, httpStatus: { not: null } },
    select: { fromType: true, fromId: true, toPath: true, httpStatus: true, checkedAt: true },
  });

  const broken = rows.filter((row) => isBrokenHttpStatus(row.httpStatus as number));
  const sources = await resolveLinkSources(broken.map((row) => ({ fromType: row.fromType, fromId: row.fromId })));

  return broken.map((row) => {
    const info = sources.get(`${row.fromType}:${row.fromId}`);
    return {
      fromType: row.fromType,
      fromId: row.fromId,
      sourceLabel: info?.label ?? row.fromId,
      adminHref: info?.adminHref ?? null,
      toPath: row.toPath,
      httpStatus: row.httpStatus as number,
      checkedAt: row.checkedAt as Date,
    };
  });
}

/** Published Project/NewsArticle/Event, each reduced to the one tuple
 *  orphan detection needs — see this file's header on why these three and
 *  no others. */
async function publishedContentRefs(locale: string): Promise<ContentRef[]> {
  const [projects, articles, events] = await Promise.all([
    prisma.project.findMany({ where: { isPublished: true, deletedAt: null }, select: { id: true } }),
    prisma.newsArticle.findMany({ where: { isPublished: true }, select: { id: true } }),
    prisma.event.findMany({ where: { isPublished: true }, select: { id: true } }),
  ]);

  return [
    ...projects.map((row) => ({ contentType: "PROJECT" as const, contentId: row.id, locale })),
    ...articles.map((row) => ({ contentType: "NEWS_ARTICLE" as const, contentId: row.id, locale })),
    ...events.map((row) => ({ contentType: "EVENT" as const, contentId: row.id, locale })),
  ];
}

async function findOrphans(locale: string, linkedPaths: Set<string>): Promise<OrphanPage[]> {
  const refs = await publishedContentRefs(locale);
  const resolved = await resolveContentRefs(refs);

  const orphans: OrphanPage[] = [];
  for (const ref of refs) {
    const info = resolved.get(`${ref.contentType}:${ref.contentId}:${ref.locale}`);
    if (!info) continue;
    if (linkedPaths.has(info.path)) continue;
    if ((SYSTEM_PATHS as readonly string[]).includes(info.path)) continue;

    orphans.push({
      contentType: ref.contentType,
      contentId: ref.contentId,
      title: info.title,
      path: info.path,
      adminHref: ADMIN_HREF[ref.contentType](ref.contentId),
    });
  }

  return orphans;
}

/** Only a walk of length ≥ 3 (two real hops) or a loop counts as a
 *  "chain" — a plain single redirect (A→B, nothing beyond) is the normal,
 *  healthy case this screen has nothing to say about. Exported for a pure
 *  unit test (tests/lib/admin/link-health.test.ts) — the root-finding and
 *  closed-loop-without-a-root cases are worth pinning down without a
 *  database. */
export function findRedirectChains(redirects: RedirectRow[]): RedirectChainGroup[] {
  const active = redirects.filter((row) => row.isActive);
  const byFromPath = new Map(active.map((row) => [row.fromPath, row]));
  const table = new Map(active.map((row) => [row.fromPath, row.toPath]));
  const targeted = new Set(active.map((row) => row.toPath));

  const visited = new Set<string>();
  const chains: RedirectChainGroup[] = [];

  const walkFrom = (startPath: string) => {
    const walk = walkRedirectChain(table, startPath);
    for (const node of walk.path) visited.add(node);
    if (!walk.loop && walk.path.length < 3) return;

    const rows: RedirectRow[] = [];
    for (let i = 0; i < walk.path.length - 1; i += 1) {
      const row = byFromPath.get(walk.path[i]);
      if (row) rows.push(row);
    }

    chains.push({ rows, terminal: walk.path[walk.path.length - 1], loop: walk.loop });
  };

  // Walk from every "root" first (a fromPath nobody else points at) so a
  // chain is reported starting at its true beginning. A closed loop with
  // no entry point (A→B→C→A) has no root at all — chainProblem() already
  // refuses creating one through the admin form, but this reporting pass
  // still needs to catch one that reached the table some other way (a
  // direct DB edit, bad data) rather than silently missing it for want of
  // a root. The second pass covers exactly that: anything a root's walk
  // didn't already visit can only be such a loop.
  const roots = active.filter((row) => !targeted.has(row.fromPath));
  for (const root of roots) walkFrom(root.fromPath);
  for (const row of active) {
    if (!visited.has(row.fromPath)) walkFrom(row.fromPath);
  }

  return chains;
}

export async function getLinkHealth(locale: string): Promise<LinkHealth> {
  return safeQuery(
    "admin:link-health",
    async () => {
      const [urlHealth, internalLinkRows, lastScanRow, externalLinks] = await Promise.all([
        getUrlHealth(),
        prisma.contentLink.findMany({ where: { isInternal: true }, select: { toPath: true } }),
        // isInternal: true only — checkExternalLinkStatuses() also bumps
        // checkedAt, but on external rows exclusively, so scoping to
        // internal rows here is what keeps "last scan" meaning the
        // full-site rescan rather than the last external-link check.
        prisma.contentLink.findFirst({
          where: { isInternal: true },
          orderBy: { checkedAt: "desc" },
          select: { checkedAt: true },
        }),
        findExternalLinkStatuses(),
      ]);

      const linkedPaths = new Set(internalLinkRows.map((row) => row.toPath));
      const orphans = await findOrphans(locale, linkedPaths);
      const chains = findRedirectChains(urlHealth.redirects);

      const totalInternalLinks = await prisma.contentLink.count({ where: { isInternal: true } });
      const activeRedirectCount = urlHealth.redirects.filter((row) => row.isActive).length;

      return {
        kpis: {
          totalInternalLinks,
          orphanCount: orphans.length,
          brokenLinkCount: urlHealth.brokenLinks.length + externalLinks.length,
          activeRedirectCount,
        },
        urlHealth,
        orphans,
        chains,
        externalLinks,
        lastScan: lastScanRow?.checkedAt ? { scannedAt: lastScanRow.checkedAt } : null,
      };
    },
    EMPTY,
  );
}
