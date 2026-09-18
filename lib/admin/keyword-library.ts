import "server-only";

/**
 * lib/admin/keyword-library.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The data behind /admin/seo/keywords — a sibling to lib/seo-audit.ts and
 * lib/admin/url-health.ts, not an extension of either: this loads the
 * Keyword/KeywordAssignment/ContentLink tables (still-dormant since the
 * schema-only phase that added them) and does its own derivation, rather
 * than adding keyword checks to getSeoAudit()'s unrelated technical-SEO
 * dashboard.
 *
 * Same "load tables, compute in memory" shape as url-health.ts: this
 * page's data volume doesn't warrant a query per row.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { resolveContentRefs, type ContentRef, type ResolvedContentRef } from "@/lib/admin/content-link-index";

export type KeywordRow = {
  id: string;
  phrase: string;
  locale: string;
  searchVolume: number | null;
  difficulty: number | null;
  currentRank: number | null;
  previousRank: number | null;
  /** previousRank - currentRank: positive means the keyword climbed
   *  (moved to a lower, better rank number). Null unless both are known. */
  change: number | null;
  trend: { w: number; rank: number }[];
  matchedPages: (ResolvedContentRef & { isPrimary: boolean })[];
};

export type CannibalizationFlag = {
  keywordId: string;
  phrase: string;
  locale: string;
  pages: ResolvedContentRef[];
};

export type TopicCluster = {
  keywordPhrases: string[];
  members: ResolvedContentRef[];
  pillar: ResolvedContentRef | null;
  pillarInboundLinks: number;
};

export type KeywordLibrary = {
  kpis: { tracked: number; top10: number; unmatched: number; cannibalizing: number };
  rows: KeywordRow[];
  cannibalization: CannibalizationFlag[];
  clusters: TopicCluster[];
  lastScan: { scannedAt: Date | null; pagesScanned: number } | null;
};

const EMPTY: KeywordLibrary = {
  kpis: { tracked: 0, top10: 0, unmatched: 0, cannibalizing: 0 },
  rows: [],
  cannibalization: [],
  clusters: [],
  lastScan: null,
};

// ── Topic clustering — pure, unit-tested directly (tests/lib/admin/
// keyword-library.test.ts), no Prisma involved. ────────────────────────

export type ContentNode = { contentType: ContentRef["contentType"]; contentId: string; locale: string };

function nodeKey(node: ContentNode): string {
  return `${node.contentType}:${node.contentId}:${node.locale}`;
}

/** Minimal union-find: nodes start in their own set, union() merges two,
 *  find() returns the representative of whichever set a node ended up in. */
class DisjointSet {
  private parent = new Map<string, string>();

  private root(key: string): string {
    if (!this.parent.has(key)) this.parent.set(key, key);
    let current = key;
    while (this.parent.get(current) !== current) current = this.parent.get(current)!;

    // Path compression — flatten every visited node straight to the root
    // so the next find() on any of them is O(1).
    let walk = key;
    while (this.parent.get(walk) !== current) {
      const next = this.parent.get(walk)!;
      this.parent.set(walk, current);
      walk = next;
    }
    return current;
  }

  union(a: string, b: string): void {
    const rootA = this.root(a);
    const rootB = this.root(b);
    if (rootA !== rootB) this.parent.set(rootA, rootB);
  }

  find(key: string): string {
    return this.root(key);
  }
}

export type TopicClusterGroup = { nodes: ContentNode[]; keywordIds: Set<string> };

/**
 * Groups content by shared KeywordAssignment rows (any isPrimary value) —
 * a cluster is a connected component in the graph where two pieces of
 * content are linked whenever they're both assigned the same keyword.
 * Discards components of fewer than 2 members: a single ungrouped page
 * isn't a "cluster" for this UI.
 */
export function buildTopicClusters(
  assignments: { keywordId: string; contentType: ContentNode["contentType"]; contentId: string; locale: string }[],
): TopicClusterGroup[] {
  const disjointSet = new DisjointSet();
  const nodeByKey = new Map<string, ContentNode>();
  const keywordsByNode = new Map<string, Set<string>>();
  const nodesByKeyword = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    const node: ContentNode = {
      contentType: assignment.contentType,
      contentId: assignment.contentId,
      locale: assignment.locale,
    };
    const key = nodeKey(node);
    nodeByKey.set(key, node);

    if (!keywordsByNode.has(key)) keywordsByNode.set(key, new Set());
    keywordsByNode.get(key)!.add(assignment.keywordId);

    if (!nodesByKeyword.has(assignment.keywordId)) nodesByKeyword.set(assignment.keywordId, new Set());
    nodesByKeyword.get(assignment.keywordId)!.add(key);
  }

  for (const nodeKeysSharingAKeyword of nodesByKeyword.values()) {
    const [first, ...rest] = [...nodeKeysSharingAKeyword];
    for (const other of rest) disjointSet.union(first, other);
  }

  const groups = new Map<string, Set<string>>();
  for (const key of nodeByKey.keys()) {
    const root = disjointSet.find(key);
    if (!groups.has(root)) groups.set(root, new Set());
    groups.get(root)!.add(key);
  }

  const clusters: TopicClusterGroup[] = [];
  for (const memberKeys of groups.values()) {
    if (memberKeys.size < 2) continue;
    const nodes = [...memberKeys].map((key) => nodeByKey.get(key)!);
    const keywordIds = new Set<string>();
    for (const key of memberKeys) for (const keywordId of keywordsByNode.get(key)!) keywordIds.add(keywordId);
    clusters.push({ nodes, keywordIds });
  }
  return clusters;
}

/**
 * Which of a cluster's (already-resolved) member pages is the pillar —
 * the one with the most inbound internal links from *other members of the
 * same cluster*. A link from outside the cluster, or to a page outside
 * it, doesn't count: "most internal links pointing to it within the
 * group" is read literally. Ties break by contentId so the result is
 * stable across re-runs with identical data.
 */
export function selectPillar(
  clusterMembers: ResolvedContentRef[],
  links: { fromType: string; fromId: string; toPath: string; isInternal: boolean }[],
): { pillar: ResolvedContentRef | null; pillarInboundLinks: number } {
  if (clusterMembers.length === 0) return { pillar: null, pillarInboundLinks: 0 };

  const memberSourceKeys = new Set(clusterMembers.map((m) => `${m.contentType}:${m.contentId}`));
  const pathToMember = new Map(clusterMembers.map((m) => [m.path, m]));

  const inboundCount = new Map<string, number>();
  for (const link of links) {
    if (!link.isInternal) continue;
    if (!memberSourceKeys.has(`${link.fromType}:${link.fromId}`)) continue;
    if (!pathToMember.has(link.toPath)) continue;
    inboundCount.set(link.toPath, (inboundCount.get(link.toPath) ?? 0) + 1);
  }

  const ranked = clusterMembers
    .map((member) => ({ member, count: inboundCount.get(member.path) ?? 0 }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.member.contentId.localeCompare(b.member.contentId));

  if (ranked.length === 0) return { pillar: null, pillarInboundLinks: 0 };
  return { pillar: ranked[0].member, pillarInboundLinks: ranked[0].count };
}

// ── The page's actual data source ──────────────────────────────────────

export async function getKeywordLibrary(): Promise<KeywordLibrary> {
  return safeQuery(
    "admin:keyword-library",
    async () => {
      const [keywords, assignments, links] = await Promise.all([
        prisma.keyword.findMany({
          orderBy: { phrase: "asc" },
          select: {
            id: true,
            phrase: true,
            locale: true,
            searchVolume: true,
            difficulty: true,
            currentRank: true,
            previousRank: true,
            trend: true,
          },
        }),
        prisma.keywordAssignment.findMany({
          select: { keywordId: true, contentType: true, contentId: true, locale: true, isPrimary: true },
        }),
        prisma.contentLink.findMany({
          select: { fromType: true, fromId: true, fromLocale: true, toPath: true, isInternal: true, checkedAt: true },
        }),
      ]);

      const assignmentsByKeyword = new Map<string, typeof assignments>();
      for (const assignment of assignments) {
        if (!assignmentsByKeyword.has(assignment.keywordId)) assignmentsByKeyword.set(assignment.keywordId, []);
        assignmentsByKeyword.get(assignment.keywordId)!.push(assignment);
      }

      // Every ref this page will ever need a title/path for, resolved in
      // one batch rather than one query per keyword/cluster.
      const allRefs: ContentRef[] = assignments
        .filter((a): a is typeof a & { contentType: ContentRef["contentType"] } =>
          a.contentType === "PROJECT" || a.contentType === "NEWS_ARTICLE" || a.contentType === "EVENT",
        )
        .map((a) => ({ contentType: a.contentType, contentId: a.contentId, locale: a.locale }));
      const resolved = await resolveContentRefs(allRefs);

      const rows: KeywordRow[] = keywords.map((keyword) => {
        const trend = Array.isArray(keyword.trend) ? (keyword.trend as { w: number; rank: number }[]) : [];
        const change =
          keyword.previousRank !== null && keyword.currentRank !== null
            ? keyword.previousRank - keyword.currentRank
            : null;

        const matchedPages = (assignmentsByKeyword.get(keyword.id) ?? [])
          .map((assignment) => {
            const ref = resolved.get(`${assignment.contentType}:${assignment.contentId}:${assignment.locale}`);
            return ref ? { ...ref, isPrimary: assignment.isPrimary } : null;
          })
          .filter((ref): ref is ResolvedContentRef & { isPrimary: boolean } => ref !== null);

        return {
          id: keyword.id,
          phrase: keyword.phrase,
          locale: keyword.locale,
          searchVolume: keyword.searchVolume,
          difficulty: keyword.difficulty,
          currentRank: keyword.currentRank,
          previousRank: keyword.previousRank,
          change,
          trend,
          matchedPages,
        };
      });

      const kpis = {
        tracked: keywords.length,
        top10: keywords.filter((k) => k.currentRank !== null && k.currentRank <= 10).length,
        unmatched: keywords.filter((k) => !assignmentsByKeyword.has(k.id)).length,
        cannibalizing: 0, // filled in below, after the cannibalization query
      };

      const cannibalizationGroups = await prisma.keywordAssignment.groupBy({
        by: ["keywordId", "locale"],
        where: { isPrimary: true },
        _count: { keywordId: true },
        having: { keywordId: { _count: { gt: 1 } } },
      });

      const keywordById = new Map(keywords.map((k) => [k.id, k]));
      const cannibalization: CannibalizationFlag[] = cannibalizationGroups
        .map((group) => {
          const keyword = keywordById.get(group.keywordId);
          if (!keyword) return null;
          const pages = assignments
            .filter((a) => a.keywordId === group.keywordId && a.locale === group.locale && a.isPrimary)
            .map((a) => resolved.get(`${a.contentType}:${a.contentId}:${a.locale}`))
            .filter((ref): ref is ResolvedContentRef => ref !== undefined);
          return { keywordId: group.keywordId, phrase: keyword.phrase, locale: group.locale, pages };
        })
        .filter((flag): flag is CannibalizationFlag => flag !== null);
      kpis.cannibalizing = cannibalization.length;

      const phraseById = new Map(keywords.map((k) => [k.id, k.phrase]));
      const clusterGroups = buildTopicClusters(
        assignments.filter(
          (a) => a.contentType === "PROJECT" || a.contentType === "NEWS_ARTICLE" || a.contentType === "EVENT",
        ) as { keywordId: string; contentType: ContentNode["contentType"]; contentId: string; locale: string }[],
      );
      const clusters: TopicCluster[] = clusterGroups.map((group) => {
        const members = group.nodes
          .map((node) => resolved.get(nodeKey(node)))
          .filter((ref): ref is ResolvedContentRef => ref !== undefined);
        const { pillar, pillarInboundLinks } = selectPillar(members, links);
        return {
          keywordPhrases: [...group.keywordIds].map((id) => phraseById.get(id)).filter((p): p is string => Boolean(p)),
          members,
          pillar,
          pillarInboundLinks,
        };
      });

      const scannedAt = links.reduce<Date | null>((latest, link) => {
        if (!link.checkedAt) return latest;
        return !latest || link.checkedAt > latest ? link.checkedAt : latest;
      }, null);
      const pagesScanned = new Set(links.map((l) => `${l.fromType}:${l.fromId}:${l.fromLocale}`)).size;

      return {
        kpis,
        rows,
        cannibalization,
        clusters,
        lastScan: links.length > 0 ? { scannedAt, pagesScanned } : null,
      };
    },
    EMPTY,
  );
}
