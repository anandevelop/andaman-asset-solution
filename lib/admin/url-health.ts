import "server-only";

/**
 * lib/admin/url-health.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The read side of "URL และการเปลี่ยนเส้นทาง" (Urls.dc.html): the redirects
 * in force, the 404s people are actually hitting, and the links inside the
 * site's own content that lead nowhere.
 *
 * THREE RULES THIS FILE KEEPS
 *
 * 1. Every number is counted, never estimated. "Used 1,204 times in 30
 *    days" is a sum over PathHitDay rows written by real requests. Where
 *    there is no data yet the answer is 0, not a guess.
 *
 * 2. Every diagnosis is checkable. A 404 is called "the project exists but
 *    is still a draft" only after finding that row; "a bot guessing
 *    filenames" comes from a short pattern list that is written down; and
 *    a typo suggestion is only offered when a real published path is
 *    within one or two characters. Anything that fits none of those is
 *    labelled as what it is — an unexplained 404 — rather than given a
 *    story.
 *
 * 3. Nothing here goes over the network. An external link in an article
 *    could only be checked by fetching it, which would make loading this
 *    page depend on somebody else's server and turn a rate-limited host
 *    into a screen full of false alarms. External links are counted and
 *    left alone; the one exception is an image on the decommissioned media
 *    host, which is knowable from the URL alone (lib/media.ts).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PathHitKind, RedirectSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { hitDay } from "@/lib/redirects";
import { isLegacyHostUrl } from "@/lib/media";
import { extractLinks, isCheckableLink, type ExtractedLink } from "@/lib/content-links";
import {
  STATIC_PATHS,
  closestPath,
  looksLikeBotProbe,
  looksLikeFile,
  slugPrefixOf,
  stripLocale,
} from "@/lib/public-paths";

/** The window every "30 days" figure on this screen is summed over. */
export const HIT_WINDOW_DAYS = 30;

/** How many 404 rows the worklist shows before "see all". */
export const NOT_FOUND_LIMIT = 25;

// ── Shapes ──────────────────────────────────────────────────────────────

/** What is at the other end of a redirect, checked the same way the
 *  broken-link scan checks a link. */
export type DestinationState = "ok" | "missing" | "draft" | "external" | "unknown";

export type RedirectRow = {
  id: string;
  fromPath: string;
  toPath: string;
  statusCode: number;
  isActive: boolean;
  source: RedirectSource;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
  /** Hits inside the window — the column the table leads with. */
  hits30: number;
  /** Lifetime, shown underneath when it is larger. */
  hitsTotal: number;
  destination: DestinationState;
};

/** Why a 404 is happening, and therefore which button to offer. */
export type NotFoundKind =
  /** The record exists but is not published. */
  | "draft"
  /** A published path is one or two characters away. */
  | "typo"
  /** A file, not a page — it moved into the media library. */
  | "file"
  /** A filename from someone else's CMS. Nothing to fix. */
  | "bot"
  /** None of the above; an admin has to decide where it should go. */
  | "unknown";

export type NotFoundRow = {
  id: string;
  path: string;
  hits30: number;
  hitsTotal: number;
  lastHitAt: string;
  kind: NotFoundKind;
  /** For "typo": the path to offer as the 301 target. */
  suggestedTarget: string | null;
  /** For "draft": where to go and publish it. */
  draftAdminHref: string | null;
  draftLabel: string | null;
  /** Host of the page that linked here, when it was somewhere else. */
  refererHost: string | null;
};

/** Where a broken link was found. */
export type BrokenLinkSource = "home" | "news" | "faq" | "project" | "event";

export type BrokenLink = {
  id: string;
  source: BrokenLinkSource;
  /** Human name of the thing holding the link — an article title, "FAQ #7". */
  sourceLabel: string;
  /** Admin URL to go and fix it. */
  adminHref: string | null;
  /** The link as written in the content. */
  target: string;
  reason: "missing" | "draft" | "legacyHost";
  /** True for an <img>/![](), false for an <a>/[](). */
  isImage: boolean;
};

export type UrlHealth = {
  redirects: RedirectRow[];
  notFound: NotFoundRow[];
  /** Rows hidden as bot noise — the count only, for the "N hidden" line. */
  hiddenCount: number;
  brokenLinks: BrokenLink[];
  /** Total 404 paths in the window, before the display limit. */
  notFoundTotal: number;
  /** External links seen and deliberately not checked — see rule 3. */
  externalLinkCount: number;
  /** The first day PathHitDay has any row for, so the table can say since
   *  when the 30-day column has been counting. Null before the first hit. */
  countingSince: string | null;
};

const EMPTY: UrlHealth = {
  redirects: [],
  notFound: [],
  hiddenCount: 0,
  brokenLinks: [],
  notFoundTotal: 0,
  externalLinkCount: 0,
  countingSince: null,
};

// ── The query ───────────────────────────────────────────────────────────

type PublishedIndex = {
  /** Every locale-relative path a visitor can reach right now. */
  live: Set<string>;
  /** Path → the unpublished record sitting at it. */
  drafts: Map<string, { label: string; adminHref: string }>;
};

/**
 * Every content path on the site, split into what a visitor can see and
 * what only an administrator can.
 *
 * The draft half is what turns "/th/projects/the-victory — 216 hits" from
 * a mystery into "somebody shared this before it was published", which is
 * a different problem with a different button.
 */
async function buildPathIndex(): Promise<PublishedIndex> {
  const [projects, articles, events, brochures] = await Promise.all([
    prisma.project.findMany({
      where: { deletedAt: null },
      select: { id: true, slug: true, isPublished: true, nameEn: true, nameTh: true },
    }),
    prisma.newsArticle.findMany({ select: { id: true, slug: true, isPublished: true, titleEn: true } }),
    prisma.event.findMany({ select: { id: true, slug: true, isPublished: true, titleEn: true } }),
    prisma.eBrochure.findMany({ select: { id: true, slug: true, isPublished: true } }),
  ]);

  const live = new Set<string>(STATIC_PATHS);
  const drafts = new Map<string, { label: string; adminHref: string }>();

  const record = (path: string, isPublished: boolean, label: string, adminHref: string) => {
    if (isPublished) live.add(path);
    else drafts.set(path, { label, adminHref });
  };

  for (const row of projects) {
    record(`/projects/${row.slug}`, row.isPublished, row.nameTh || row.nameEn, `/admin/projects/${row.id}/edit`);
  }
  for (const row of articles) {
    record(`/news/${row.slug}`, row.isPublished, row.titleEn, `/admin/news/${row.id}/edit`);
  }
  for (const row of events) {
    record(`/events/${row.slug}`, row.isPublished, row.titleEn, `/admin/events/${row.id}/edit`);
  }
  for (const row of brochures) {
    record(`/e-brochure/${row.slug}`, row.isPublished, row.slug, `/admin/e-brochures/${row.id}/edit`);
  }

  return { live, drafts };
}

/** What sits at the end of a link or a redirect. */
function classifyDestination(
  target: string,
  index: PublishedIndex,
  redirected: Set<string>,
): DestinationState {
  const value = target.trim();
  if (value.length === 0) return "unknown";
  if (/^https?:\/\//i.test(value)) return "external";
  if (!value.startsWith("/")) return "unknown";

  const path = stripLocale(value);

  if (index.live.has(path)) return "ok";
  if (index.drafts.has(path)) return "draft";
  // A path with its own redirect is not broken — following it lands
  // somewhere, which is the whole point of the row.
  if (redirected.has(path)) return "ok";

  // Only a path under a known content prefix can be called missing with
  // any confidence. Anything else — a section this file does not know
  // about, a file, a path served by something outside Next — is left
  // alone rather than reported as broken on a guess.
  if (slugPrefixOf(path)) return "missing";
  if (looksLikeFile(path)) return "unknown";

  return STATIC_PATHS.some((known) => path.startsWith(`${known}/`)) ? "missing" : "unknown";
}

/** Sum of PathHitDay inside the window, keyed by path. */
async function hitsInWindow(kind: PathHitKind): Promise<Map<string, number>> {
  const since = hitDay(new Date(Date.now() - HIT_WINDOW_DAYS * 24 * 60 * 60 * 1000));

  const groups = await prisma.pathHitDay.groupBy({
    by: ["path"],
    where: { kind, day: { gte: since } },
    _sum: { hits: true },
  });

  return new Map(groups.map((group) => [group.path, group._sum.hits ?? 0]));
}

async function scanBrokenLinks(
  index: PublishedIndex,
  redirected: Set<string>,
): Promise<{ links: BrokenLink[]; externalCount: number }> {
  const [articles, faqs, projects, events, slides] = await Promise.all([
    prisma.newsArticle.findMany({
      where: { isPublished: true },
      select: { id: true, titleEn: true, translations: { select: { locale: true, content: true } } },
    }),
    prisma.faq.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        questionEn: true,
        answerEn: true,
        answerTh: true,
        sortOrder: true,
        translations: { select: { locale: true, answer: true } },
      },
    }),
    prisma.project.findMany({
      where: { isPublished: true, deletedAt: null },
      select: {
        id: true,
        nameEn: true,
        nameTh: true,
        translations: {
          select: { locale: true, description: true, conceptDesign: true, aboutThisProject: true },
        },
      },
    }),
    prisma.event.findMany({
      where: { isPublished: true },
      select: { id: true, titleEn: true, translations: { select: { locale: true, description: true } } },
    }),
    prisma.heroStorySlide.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, ctaUrl: true, mediaUrl: true },
    }),
  ]);

  const links: BrokenLink[] = [];
  let externalCount = 0;
  const seen = new Set<string>();

  const consider = (
    source: BrokenLinkSource,
    sourceLabel: string,
    adminHref: string | null,
    { target, isImage }: ExtractedLink,
  ) => {
    if (!isCheckableLink(target)) return;

    if (/^https?:\/\//i.test(target)) {
      // The one external check that needs no network: an image still
      // pointing at the media host that was switched off.
      if (isLegacyHostUrl(target)) {
        const key = `${source}:${sourceLabel}:${target}`;
        if (seen.has(key)) return;
        seen.add(key);
        links.push({
          id: key,
          source,
          sourceLabel,
          adminHref,
          target,
          reason: "legacyHost",
          isImage,
        });
      } else {
        externalCount += 1;
      }
      return;
    }

    const state = classifyDestination(target, index, redirected);
    if (state !== "missing" && state !== "draft") return;

    // One entry per (place, link) however many languages repeat it — the
    // fix is one edit, so four rows would be three false alarms.
    const key = `${source}:${sourceLabel}:${stripLocale(target)}`;
    if (seen.has(key)) return;
    seen.add(key);

    links.push({
      id: key,
      source,
      sourceLabel,
      adminHref,
      target,
      reason: state,
      isImage,
    });
  };

  for (const article of articles) {
    for (const translation of article.translations) {
      for (const link of extractLinks(translation.content)) {
        consider("news", article.titleEn, `/admin/news/${article.id}/edit`, link);
      }
    }
  }

  for (const faq of faqs) {
    const bodies = [faq.answerEn, faq.answerTh, ...faq.translations.map((t) => t.answer)];
    for (const body of bodies) {
      for (const link of extractLinks(body)) {
        consider("faq", faq.questionEn, `/admin/pages/faq/${faq.id}/edit`, link);
      }
    }
  }

  for (const project of projects) {
    const label = project.nameTh || project.nameEn;
    for (const translation of project.translations) {
      const bodies = [translation.description, translation.conceptDesign, translation.aboutThisProject];
      for (const body of bodies) {
        for (const link of extractLinks(body)) {
          consider("project", label, `/admin/projects/${project.id}/content`, link);
        }
      }
    }
  }

  for (const event of events) {
    for (const translation of event.translations) {
      for (const link of extractLinks(translation.description)) {
        consider("event", event.titleEn, `/admin/events/${event.id}/edit`, link);
      }
    }
  }

  slides.forEach((slide, index) => {
    /*
      The home page's own links — where the design's first example comes
      from, a hero slide still pointing at a project page that was taken
      down. Named by position rather than by id, because "slide 2" is how
      somebody about to fix it will find it on /admin/pages/home/hero.
    */
    const label = `#${index + 1}`;

    if (slide.ctaUrl) {
      consider("home", label, "/admin/pages/home/hero", { target: slide.ctaUrl, isImage: false });
    }
    consider("home", label, "/admin/pages/home/hero", { target: slide.mediaUrl, isImage: true });
  });

  return { links, externalCount };
}

export async function getUrlHealth(): Promise<UrlHealth> {
  return safeQuery(
    "admin:url-health",
    async () => {
      const [redirectRows, notFoundRows, hiddenCount, index, redirectHits, notFoundHits, firstDay] =
        await Promise.all([
          prisma.redirect.findMany({
            orderBy: [{ source: "asc" }, { createdAt: "desc" }],
            select: {
              id: true,
              fromPath: true,
              toPath: true,
              statusCode: true,
              isActive: true,
              source: true,
              note: true,
              expiresAt: true,
              createdAt: true,
              hits: true,
            },
          }),
          prisma.notFoundHit.findMany({
            where: { hiddenAt: null },
            orderBy: { hits: "desc" },
            select: { id: true, path: true, referer: true, hits: true, lastHitAt: true },
          }),
          prisma.notFoundHit.count({ where: { hiddenAt: { not: null } } }),
          buildPathIndex(),
          hitsInWindow(PathHitKind.REDIRECT),
          hitsInWindow(PathHitKind.NOT_FOUND),
          prisma.pathHitDay.findFirst({ orderBy: { day: "asc" }, select: { day: true } }),
        ]);

      const redirected = new Set(redirectRows.filter((row) => row.isActive).map((row) => row.fromPath));

      const redirects: RedirectRow[] = redirectRows.map((row) => ({
        id: row.id,
        fromPath: row.fromPath,
        toPath: row.toPath,
        statusCode: row.statusCode,
        isActive: row.isActive,
        source: row.source,
        note: row.note,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        hits30: redirectHits.get(row.fromPath) ?? 0,
        hitsTotal: row.hits,
        destination: classifyDestination(row.toPath, index, redirected),
      }));

      /*
        Candidate targets for the typo check: everything a visitor can
        reach. A suggestion is only ever a live path, never a draft — the
        button says "point this at that", and pointing it at a page nobody
        can see would trade a 404 for a 404.
      */
      const livePaths = [...index.live];

      const notFound: NotFoundRow[] = notFoundRows.map((row) => {
        const path = stripLocale(row.path);
        const draft = index.drafts.get(path);

        let kind: NotFoundKind = "unknown";
        let suggestedTarget: string | null = null;

        if (draft) {
          kind = "draft";
        } else if (looksLikeBotProbe(path)) {
          kind = "bot";
        } else if (looksLikeFile(path)) {
          kind = "file";
        } else {
          const near = closestPath(path, livePaths);
          if (near) {
            kind = "typo";
            suggestedTarget = near;
          }
        }

        let refererHost: string | null = null;
        if (row.referer) {
          try {
            refererHost = new URL(row.referer).host;
          } catch {
            refererHost = null;
          }
        }

        return {
          id: row.id,
          path: row.path,
          hits30: notFoundHits.get(row.path) ?? 0,
          hitsTotal: row.hits,
          lastHitAt: row.lastHitAt.toISOString(),
          kind,
          suggestedTarget,
          draftAdminHref: draft?.adminHref ?? null,
          draftLabel: draft?.label ?? null,
          refererHost,
        };
      });

      const { links, externalCount } = await scanBrokenLinks(index, redirected);

      return {
        redirects,
        notFound: notFound.slice(0, NOT_FOUND_LIMIT),
        notFoundTotal: notFound.length,
        hiddenCount,
        brokenLinks: links,
        externalLinkCount: externalCount,
        countingSince: firstDay?.day.toISOString() ?? null,
      };
    },
    EMPTY,
  );
}

/** Redirect rows as a CSV file, for the export button. */
export function redirectsToCsv(rows: RedirectRow[]): string {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const header = ["from", "to", "status", "active", "source", "note", "expires_at", "hits_30d", "hits_total"];

  const lines = rows.map((row) =>
    [
      escape(row.fromPath),
      escape(row.toPath),
      String(row.statusCode),
      row.isActive ? "true" : "false",
      row.source,
      escape(row.note ?? ""),
      row.expiresAt ?? "",
      String(row.hits30),
      String(row.hitsTotal),
    ].join(","),
  );

  return [header.join(","), ...lines].join("\n");
}
