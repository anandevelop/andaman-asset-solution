import "server-only";

/**
 * lib/admin/link-opportunities.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Section 5.3's "โอกาสเชื่อมลิงก์" — find a title mentioned in a body that
 * isn't a link yet, and (ADMIN-only) turn it into one.
 *
 * SOURCE SCOPE: NEWS ARTICLES ONLY, ON PURPOSE
 *
 * The spec's own wording ("บทความ" — article) turns out to be load-bearing,
 * not just phrasing: Project.description/conceptDesign/aboutThisProject and
 * EventTranslation.description have no rendering pipeline at all — the
 * public pages print them as plain text (`whitespace-pre-line`), not
 * Markdown and not sanitized HTML. Splicing `[text](url)` or
 * `<a href=…>` into one of those fields would not create a link; it would
 * show the raw markup characters to a site visitor, which is worse than
 * doing nothing. Only NewsArticleTranslation.content has a real renderer
 * (Markdown via renderMarkdown, or HTML via sanitizeArticleHtml), so only
 * NewsArticle bodies are scanned or written to as a *source*.
 *
 * A Project or Event can still be the *target* of a suggested link — a
 * news article mentioning a project by name is exactly the case this
 * feature is for — only the source side is restricted.
 *
 * lib/content-links.ts's own extractLinks() (and this initiative's
 * link-graph scan) already reads Project/Event body fields as if they held
 * real link syntax, for broken-link detection — a pre-existing
 * inconsistency this file does not extend, since it never writes to those
 * fields.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { resolveTitle, resolveLinkSources } from "@/lib/admin/content-link-index";
import { saveRevision } from "@/lib/content-revisions";
import { sanitizeArticleHtml } from "@/lib/markdown";
import { scanAndPersistLinkGraph } from "@/lib/admin/link-graph";

// ── Excluded spans ─────────────────────────────────────────────────────

type Span = { start: number; end: number };

const MARKDOWN_LINK_OR_IMAGE = /(!)?\[[^\]]*\]\(\s*[^)\s]+\s*\)/g;
const HTML_ANCHOR = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
const HTML_IMG = /<img\b[^>]*>/gi;
const HTML_HEADING = /<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi;
const MARKDOWN_HEADING_LINE = /^#{1,6}\s.*$/gm;

function collectSpans(body: string, pattern: RegExp): Span[] {
  const spans: Span[] = [];
  for (const match of body.matchAll(pattern)) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}

function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return [];
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: Span[] = [{ ...sorted[0] }];

  for (const span of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    if (span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }

  return merged;
}

/**
 * Spans already spoken for — an existing link, an image, or a heading
 * line — so scanTitleMentions() never proposes turning already-linked or
 * heading text into a second link. Checked unconditionally for both
 * Markdown and HTML syntax rather than branching on a declared format,
 * the same "both, always" rule lib/content-links.ts's own extractLinks()
 * uses, since a body can mix the two regardless of contentFormat.
 */
export function excludedSpans(body: string): Span[] {
  return mergeSpans([
    ...collectSpans(body, MARKDOWN_LINK_OR_IMAGE),
    ...collectSpans(body, HTML_ANCHOR),
    ...collectSpans(body, HTML_IMG),
    ...collectSpans(body, HTML_HEADING),
    ...collectSpans(body, MARKDOWN_HEADING_LINE),
  ]);
}

// ── Exact, whole-phrase, case-insensitive matching ─────────────────────

/** Same Thai Unicode block lib/content-stats.ts's own word counter uses
 *  (THAI_CHAR there) — reused here rather than a second, slightly
 *  different range, so "is this character Thai" has one answer in this
 *  codebase. */
const THAI_BLOCK = "฀-๿";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * `\b` is meaningless for Thai script — there is no `\w`/non-`\w`
 * transition between two Thai characters, the same gap
 * lib/content-stats.ts's word counter already works around. Approximated
 * here with a lookaround requiring no adjacent Thai character on either
 * side, rather than a real word boundary.
 */
export function boundaryRegex(title: string, locale: string): RegExp {
  const escaped = escapeRegExp(title);
  if (locale === "th") return new RegExp(`(?<![${THAI_BLOCK}])${escaped}(?![${THAI_BLOCK}])`, "gi");
  return new RegExp(`\\b${escaped}\\b`, "gi");
}

export type TitleCandidate = { title: string };
export type TitleMention = { candidateIndex: number; start: number; end: number; matchedText: string };

function overlapsAny(span: Span, spans: Span[]): boolean {
  return spans.some((s) => span.start < s.end && span.end > s.start);
}

/**
 * Every candidate title mentioned in `body` outside an existing link or
 * heading — one match per candidate at most (the first one found, not
 * every occurrence), and candidates are tried longest-title-first so a
 * longer title claims its span before a shorter title contained within it
 * (e.g. "Trinity Village Residences" vs. "Trinity Village") is tried
 * against what's left.
 */
export function scanTitleMentions(body: string, locale: string, candidates: TitleCandidate[]): TitleMention[] {
  if (!body || candidates.length === 0) return [];

  const excluded = excludedSpans(body);
  const claimed: Span[] = [];
  const mentions: TitleMention[] = [];

  const order = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.title.trim().length > 0)
    .sort((a, b) => b.candidate.title.length - a.candidate.title.length);

  for (const { candidate, index } of order) {
    const regex = boundaryRegex(candidate.title, locale);
    let match: RegExpExecArray | null;
    let found: TitleMention | null = null;

    while ((match = regex.exec(body)) !== null) {
      const span = { start: match.index, end: match.index + match[0].length };
      if (overlapsAny(span, excluded) || overlapsAny(span, claimed)) continue;
      found = { candidateIndex: index, start: span.start, end: span.end, matchedText: match[0] };
      break;
    }

    if (found) {
      claimed.push({ start: found.start, end: found.end });
      mentions.push(found);
    }
  }

  return mentions;
}

// ── Ranking ─────────────────────────────────────────────────────────────

/** Same 4.2-characters-per-word approximation lib/content-stats.ts's own
 *  countWords() uses for Thai (no inter-word spaces to split on). */
function titleWordCount(title: string, locale: string): number {
  if (locale === "th") {
    const thaiChars = title.match(new RegExp(`[${THAI_BLOCK}]`, "g"))?.length ?? 0;
    return thaiChars / 4.2;
  }
  return title.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Binding decision 3 makes matching itself a binary gate (always a full
 * exact title match), so "match quality" here means how distinctive the
 * match is — a longer, multi-word title is a stronger, more deliberate
 * signal than a two-word one — while the inbound-link scarcity term
 * dominates the sort, per the spec's own "boost under-linked pages"
 * framing. The 0.4/0.6 split is a starting point, not a tuned constant;
 * tests assert monotonicity, not pinned numbers.
 */
export function opportunityWeight(titleWordCount: number, inboundLinkCount: number): number {
  const matchQuality = Math.min(1, titleWordCount / 6);
  const inboundBoost = 1 / (1 + inboundLinkCount);
  return 0.4 * matchQuality + 0.6 * inboundBoost;
}

// ── The finder ──────────────────────────────────────────────────────────

export type LinkOpportunityTargetType = "PROJECT" | "NEWS_ARTICLE" | "EVENT";

export type LinkOpportunity = {
  id: string;
  sourceId: string;
  sourceLocale: string;
  sourceTitle: string;
  targetType: LinkOpportunityTargetType;
  targetId: string;
  targetTitle: string;
  targetPath: string;
  matchedText: string;
  weight: number;
};

export type LinkOpportunityScope = { type: "NEWS_ARTICLE"; id: string };

/** Matches url-health.ts's own NOT_FOUND_LIMIT display-cap precedent. */
const OPPORTUNITY_LIMIT = 20;

type TargetCandidate = {
  type: LinkOpportunityTargetType;
  id: string;
  path: string;
  locale: string;
  title: string;
};

/** Published Project/NewsArticle/Event, one candidate row per (item,
 *  locale) — link *targets* are not restricted to News the way sources
 *  are, since a working link can point at any of the three. */
async function loadTargetCandidates(): Promise<TargetCandidate[]> {
  const [projects, articles, events] = await Promise.all([
    prisma.project.findMany({
      where: { isPublished: true, deletedAt: null },
      select: { id: true, slug: true, nameEn: true, nameTh: true, translations: { select: { locale: true, name: true } } },
    }),
    prisma.newsArticle.findMany({
      where: { isPublished: true },
      select: { id: true, slug: true, titleEn: true, titleTh: true, translations: { select: { locale: true, title: true } } },
    }),
    prisma.event.findMany({
      where: { isPublished: true },
      select: { id: true, slug: true, titleEn: true, titleTh: true, translations: { select: { locale: true, title: true } } },
    }),
  ]);

  const candidates: TargetCandidate[] = [];
  for (const locale of locales) {
    for (const row of projects) {
      candidates.push({
        type: "PROJECT",
        id: row.id,
        path: `/projects/${row.slug}`,
        locale,
        title: resolveTitle(row.translations, locale, "name", row.nameTh, row.nameEn),
      });
    }
    for (const row of articles) {
      candidates.push({
        type: "NEWS_ARTICLE",
        id: row.id,
        path: `/news/${row.slug}`,
        locale,
        title: resolveTitle(row.translations, locale, "title", row.titleTh, row.titleEn),
      });
    }
    for (const row of events) {
      candidates.push({
        type: "EVENT",
        id: row.id,
        path: `/events/${row.slug}`,
        locale,
        title: resolveTitle(row.translations, locale, "title", row.titleTh, row.titleEn),
      });
    }
  }
  return candidates;
}

/**
 * Site-wide (no `scope`) or narrowed to one article's own body (the
 * editor's Links tab). The site-wide call only considers published
 * articles as sources — an unpublished draft's opportunities aren't
 * site-wide news yet — while a scoped call always uses the exact article
 * asked for, published or not, since an admin editing it wants
 * suggestions while still drafting.
 */
export async function findLinkOpportunities(scope?: LinkOpportunityScope): Promise<LinkOpportunity[]> {
  const [targets, sourceArticles, inboundGroups] = await Promise.all([
    loadTargetCandidates(),
    prisma.newsArticle.findMany({
      where: scope ? { id: scope.id } : { isPublished: true },
      select: {
        id: true,
        titleEn: true,
        titleTh: true,
        translations: { select: { locale: true, title: true, content: true } },
      },
    }),
    prisma.contentLink.groupBy({ by: ["toPath"], where: { isInternal: true }, _count: { toPath: true } }),
  ]);

  const inboundByPath = new Map(inboundGroups.map((row) => [row.toPath, row._count.toPath]));
  const opportunities: LinkOpportunity[] = [];

  for (const article of sourceArticles) {
    const sourceTitleFallback = { titleTh: article.titleTh, titleEn: article.titleEn };

    for (const translation of article.translations) {
      if (!translation.content) continue;

      const candidatesForLocale = targets.filter(
        (t) => t.locale === translation.locale && !(t.type === "NEWS_ARTICLE" && t.id === article.id),
      );
      if (candidatesForLocale.length === 0) continue;

      const mentions = scanTitleMentions(translation.content, translation.locale, candidatesForLocale);

      for (const mention of mentions) {
        const target = candidatesForLocale[mention.candidateIndex];
        const inbound = inboundByPath.get(target.path) ?? 0;
        const weight = opportunityWeight(titleWordCount(target.title, translation.locale), inbound);

        opportunities.push({
          id: `${article.id}:${translation.locale}:${target.type}:${target.id}`,
          sourceId: article.id,
          sourceLocale: translation.locale,
          sourceTitle: resolveTitle(
            article.translations,
            translation.locale,
            "title",
            sourceTitleFallback.titleTh,
            sourceTitleFallback.titleEn,
          ),
          targetType: target.type,
          targetId: target.id,
          targetTitle: target.title,
          targetPath: target.path,
          matchedText: mention.matchedText,
          weight,
        });
      }
    }
  }

  return opportunities.sort((a, b) => b.weight - a.weight).slice(0, OPPORTUNITY_LIMIT);
}

// ── The auto-insert mutation ────────────────────────────────────────────

export type ApplyLinkOpportunityInput = {
  sourceId: string;
  sourceLocale: string;
  targetType: LinkOpportunityTargetType;
  targetId: string;
  targetPath: string;
};

export type ApplyLinkOpportunityResult =
  | { ok: true }
  | { ok: false; error: "NOT_FOUND" | "OPPORTUNITY_STALE" | "SAVE_FAILED" };

/** Re-resolves a target's *current* title, published-only — never trusts
 *  a client-sent title, since the target may have been renamed or
 *  unpublished since the opportunity was computed. */
async function currentTargetTitle(type: LinkOpportunityTargetType, id: string, locale: string): Promise<string | null> {
  if (type === "PROJECT") {
    const row = await prisma.project.findFirst({
      where: { id, deletedAt: null, isPublished: true },
      select: { nameEn: true, nameTh: true, translations: { select: { locale: true, name: true } } },
    });
    return row ? resolveTitle(row.translations, locale, "name", row.nameTh, row.nameEn) : null;
  }

  if (type === "NEWS_ARTICLE") {
    const row = await prisma.newsArticle.findFirst({
      where: { id, isPublished: true },
      select: { titleEn: true, titleTh: true, translations: { select: { locale: true, title: true } } },
    });
    return row ? resolveTitle(row.translations, locale, "title", row.titleTh, row.titleEn) : null;
  }

  const row = await prisma.event.findFirst({
    where: { id, isPublished: true },
    select: { titleEn: true, titleTh: true, translations: { select: { locale: true, title: true } } },
  });
  return row ? resolveTitle(row.translations, locale, "title", row.titleTh, row.titleEn) : null;
}

function spliceLink(body: string, mention: TitleMention, targetPath: string, format: string): string {
  const replacement =
    format === "HTML" ? `<a href="${targetPath}">${mention.matchedText}</a>` : `[${mention.matchedText}](${targetPath})`;
  return body.slice(0, mention.start) + replacement + body.slice(mention.end);
}

/**
 * Applies one opportunity: re-validates it against the *current* live
 * body and the target's *current* title (never a client-sent offset or
 * title), snapshots a revision first, splices the link in, sanitizes when
 * the article is HTML (the same pass updateArticle already applies at
 * save time), and re-runs the link-graph scan so ContentLink reflects the
 * new link immediately.
 */
export async function applyLinkOpportunity(
  input: ApplyLinkOpportunityInput,
  createdById: string | null,
): Promise<ApplyLinkOpportunityResult> {
  if (input.targetType === "NEWS_ARTICLE" && input.targetId === input.sourceId) {
    return { ok: false, error: "NOT_FOUND" };
  }

  const article = await prisma.newsArticle.findFirst({
    where: { id: input.sourceId },
    select: {
      id: true,
      contentFormat: true,
      translations: { where: { locale: input.sourceLocale }, select: { content: true } },
    },
  });
  const translation = article?.translations[0];
  if (!article || !translation?.content) return { ok: false, error: "NOT_FOUND" };

  const targetTitle = await currentTargetTitle(input.targetType, input.targetId, input.sourceLocale);
  if (!targetTitle) return { ok: false, error: "NOT_FOUND" };

  const mentions = scanTitleMentions(translation.content, input.sourceLocale, [{ title: targetTitle }]);
  const mention = mentions[0];
  if (!mention) return { ok: false, error: "OPPORTUNITY_STALE" };

  const spliced = spliceLink(translation.content, mention, input.targetPath, article.contentFormat);
  const finalContent = article.contentFormat === "HTML" ? sanitizeArticleHtml(spliced) : spliced;

  try {
    await saveRevision({ contentType: "NEWS_ARTICLE", contentId: article.id, createdById, source: "link_opportunity" });
    await prisma.newsArticleTranslation.update({
      where: { articleId_locale: { articleId: article.id, locale: input.sourceLocale } },
      data: { content: finalContent },
    });
    await scanAndPersistLinkGraph();
  } catch {
    return { ok: false, error: "SAVE_FAILED" };
  }

  return { ok: true };
}

// ── The editor's own Links tab (5.4) ────────────────────────────────────

export type InboundLink = {
  fromType: string;
  fromId: string;
  label: string;
  adminHref: string | null;
  /** The clickable text used on the linking page, when the scan recorded
   *  one — null for a link syntax with no text between the brackets. */
  anchorText: string | null;
};

/** Last-checked HTTP status plus when — the "checked 2h ago" a stale badge
 *  needs to read as stale rather than as a live result. */
export type ExternalLinkStatus = { status: number | null; checkedAt: Date | null };

export type ArticleLinkPanel = {
  /** "Should link to" — opportunities scoped to this one article. */
  opportunities: LinkOpportunity[];
  /** "Links that point in" — every other place with a real ContentLink
   *  row targeting this article's own public path. */
  inboundLinks: InboundLink[];
  /** toPath → last-checked status, for annotating the body's live
   *  external-link list with its last known status. Reflects the last
   *  save-and-rescan, not the editor's unsaved keystrokes — see this
   *  panel's own "stated limitation" in the phase plan. */
  externalStatuses: Record<string, ExternalLinkStatus>;
};

export async function getArticleLinkPanel(params: {
  id: string;
  locale: string;
  publicPath: string;
}): Promise<ArticleLinkPanel> {
  const [opportunities, inboundRows, externalRows] = await Promise.all([
    findLinkOpportunities({ type: "NEWS_ARTICLE", id: params.id }),
    prisma.contentLink.findMany({
      where: { toPath: params.publicPath, isInternal: true },
      select: { fromType: true, fromId: true, anchorText: true },
    }),
    prisma.contentLink.findMany({
      where: { fromType: "NEWS_ARTICLE", fromId: params.id, isInternal: false },
      select: { toPath: true, httpStatus: true, checkedAt: true },
    }),
  ]);

  // A source can repeat once per locale it links from — one row per
  // (fromType, fromId) is what the tab shows, not one per language.
  const uniqueSources = [...new Map(inboundRows.map((r) => [`${r.fromType}:${r.fromId}`, r])).values()];
  const sourceLabels = await resolveLinkSources(uniqueSources);

  const inboundLinks: InboundLink[] = uniqueSources.map((row) => {
    const info = sourceLabels.get(`${row.fromType}:${row.fromId}`);
    return {
      fromType: row.fromType,
      fromId: row.fromId,
      label: info?.label ?? row.fromId,
      adminHref: info?.adminHref ?? null,
      anchorText: row.anchorText,
    };
  });

  const externalStatuses: Record<string, ExternalLinkStatus> = {};
  for (const row of externalRows) {
    externalStatuses[row.toPath] = { status: row.httpStatus, checkedAt: row.checkedAt };
  }

  return {
    opportunities: opportunities.filter((o) => o.sourceLocale === params.locale),
    inboundLinks,
    externalStatuses,
  };
}
