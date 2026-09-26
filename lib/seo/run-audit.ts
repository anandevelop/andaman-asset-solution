/**
 * lib/seo/run-audit.ts
 * ─────────────────────────────────────────────────────────────────────────
 * One audit run: collect every URL, fetch each page, apply the fifteen
 * rules, write the result.
 *
 * Two tables, because they answer two questions that pull in opposite
 * directions. SeoUrlState is overwritten every run — "what is wrong with
 * this page now" — and SeoAuditRun appends one row — "is the site getting
 * better". Keeping per-URL history would be a large table nobody queries;
 * keeping only the latest would leave the trend graph with nothing to plot.
 *
 * FETCHING IS THE SLOW PART AND IS BOUNDED
 *
 * A few hundred URLs, each a real HTTP request to our own server. Run flat
 * out they would be a self-inflicted load test; run one at a time they
 * would take ten minutes. runWithLimit — the same helper the external-link
 * checker already uses — keeps a handful in flight, which is the difference
 * between a job that finishes and one that times out.
 *
 * IT AUDITS ITS OWN DEPLOYMENT, NOT THE CANONICAL URL
 *
 * The base URL is passed in, from the origin of the request that triggered
 * the run. The first version used siteConfig.url — the canonical marketing
 * address — and on this project that is still the client's previous
 * WordPress site: the audit dutifully fetched 80 pages of somebody else's
 * website, got 404 for 75 of them and scored the other five against markup
 * this codebase never produced. A self-audit has to fetch *self*, and the
 * only thing that reliably knows where self is, is the request that arrived.
 *
 * The canonical rule still compares against the canonical domain, which is
 * why it compares pathnames rather than whole URLs — a staging deployment
 * correctly emits the production canonical.
 *
 * A FAILED FETCH IS NOT A FAILED PAGE
 *
 * fetchRendered returns null and the six rules that need it skip. The
 * score is then out of the weight that could be judged, and checkedWeight
 * records how much that was, so the screen can say "not checked" instead of
 * showing a number that means nothing. See lib/seo/score.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/config/site";
import { isSiteIndexable } from "@/lib/indexing";
import { runWithLimit } from "@/lib/admin/link-graph";
import { collectUrls, countDuplicates } from "@/lib/seo/collect";
import { fetchRendered } from "@/lib/seo/fetch-rendered";
import { auditUrl, summariseRun, type UrlScore } from "@/lib/seo/score";
import type { SeoRuleInput } from "@/lib/seo/types";

/** Concurrent page fetches. Six is enough to finish a few hundred URLs in
 *  a minute or two and few enough that the site stays responsive to the
 *  people it is actually for. */
const FETCH_CONCURRENCY = 6;

export type AuditRunResult = {
  urlCount: number;
  avgScore: number;
  passAllCount: number;
  failCountByRule: Record<string, number>;
  /** URLs whose page could not be fetched — worth surfacing separately
   *  from a low score, because the cause is different. */
  unreachableCount: number;
  durationMs: number;
};

export async function runSeoAudit(options: { baseUrl?: string } = {}): Promise<AuditRunResult> {
  const startedAt = Date.now();
  // siteConfig.url is the fallback and is usually wrong for this purpose —
  // see the header. The caller should pass its own origin.
  const baseUrl = (options.baseUrl ?? siteConfig.url).replace(/\/$/, "");
  const indexable = isSiteIndexable();

  const [collected, waivers] = await Promise.all([
    collectUrls(indexable),
    prisma.seoRuleWaiver.findMany({ select: { url: true, ruleKey: true } }),
  ]);

  const duplicates = countDuplicates(collected);

  const waivedByUrl = new Map<string, Set<string>>();
  for (const waiver of waivers) {
    const set = waivedByUrl.get(waiver.url);
    if (set) set.add(waiver.ruleKey);
    else waivedByUrl.set(waiver.url, new Set([waiver.ruleKey]));
  }

  const scored = await runWithLimit(collected, FETCH_CONCURRENCY, async (url) => {
    const rendered = await fetchRendered(`${baseUrl}${url.url}`);

    const input: SeoRuleInput = {
      ...url,
      duplicates: {
        title: url.title ? (duplicates.title.get(url.title) ?? 0) : 0,
        metaDescription: url.metaDescription
          ? (duplicates.metaDescription.get(url.metaDescription) ?? 0)
          : 0,
      },
      rendered,
      // Phase 1 leaves this null: lib/admin/url-health.ts's broken-link
      // scan reports per source *record*, not per URL, and mapping one to
      // the other is its own piece of work. The rule skips rather than
      // guessing, which is the honest state until that mapping exists.
      brokenInternalLinks: null,
    };

    return {
      url,
      rendered,
      score: auditUrl(input, waivedByUrl.get(url.url) ?? new Set()),
    };
  });

  await persist(scored);

  const summary = summariseRun(scored.map((row) => row.score));
  const run = await prisma.seoAuditRun.create({
    data: {
      urlCount: summary.urlCount,
      avgScore: summary.avgScore,
      passAllCount: summary.passAllCount,
      failCountByRule: summary.failCountByRule,
    },
    select: { id: true },
  });
  void run;

  return {
    ...summary,
    unreachableCount: scored.filter((row) => row.rendered === null).length,
    durationMs: Date.now() - startedAt,
  };
}

type ScoredUrl = {
  url: Awaited<ReturnType<typeof collectUrls>>[number];
  rendered: unknown;
  score: UrlScore;
};

/**
 * Write every URL's latest state.
 *
 * Upsert per URL rather than delete-all-then-insert: a reader opening the
 * audit tab mid-run should see the previous run's numbers, not an empty
 * table. Chunked for the same reason lib/admin/link-graph.ts chunks —
 * one statement per few hundred rows rather than one enormous one.
 */
async function persist(scored: readonly ScoredUrl[]): Promise<void> {
  const CHUNK = 50;

  for (let index = 0; index < scored.length; index += CHUNK) {
    const chunk = scored.slice(index, index + CHUNK);

    await prisma.$transaction(
      chunk.map((row) =>
        prisma.seoUrlState.upsert({
          where: { url: row.url.url },
          create: {
            url: row.url.url,
            locale: row.url.locale,
            entityType: row.url.entityType,
            entityId: row.url.entityId,
            auditScore: row.score.score,
            checkedWeight: row.score.checkedWeight,
            failedRules: row.score.failedRules,
            waivedRules: row.score.waivedRules,
          },
          update: {
            locale: row.url.locale,
            entityType: row.url.entityType,
            entityId: row.url.entityId,
            auditScore: row.score.score,
            checkedWeight: row.score.checkedWeight,
            failedRules: row.score.failedRules,
            waivedRules: row.score.waivedRules,
            checkedAt: new Date(),
          },
        }),
      ),
    );
  }

  // A URL that no longer exists — an unpublished project, a deleted
  // article — must not sit in the table forever showing an old score.
  const liveUrls = scored.map((row) => row.url.url);
  await prisma.seoUrlState.deleteMany({ where: { url: { notIn: liveUrls } } });
}
