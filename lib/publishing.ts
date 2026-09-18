import "server-only";

/**
 * lib/publishing.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read side of the Publishing dashboard (Publishing.dc.html) — the
 * dashboard stat cards, the review queue, and the 4-locale completeness
 * table. See lib/content-revisions.ts for why "content" here means each
 * type's translation rows, not its full schema row.
 *
 * "Submitted by" / "last touched by" is not a new column — it is read
 * straight off AuditLog, which already records every write to these
 * models (see lib/audit/extension.ts). A dedicated workflow table
 * tracking who did what would just be a second, narrower copy of a trail
 * that already exists.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { ContentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { locales, LOCALE_DISPLAY_ORDER } from "@/i18n";
import { AUDIT_MODEL_NAME, type PublishableType } from "@/lib/content-revisions";

/**
 * One "what changed" chip on a review-queue card.
 *
 * Two sources, because the trail has two shapes. A `field` chip is a name
 * out of AuditLog.changedFields — the audit extension records *which
 * fields a write set*, never their values ("names, not contents", by
 * design), so it can say the hero image was written but not what it was
 * before. A `translation` chip is stronger: ContentRevision snapshots do
 * hold translation content, so a per-locale chip is a real diff against
 * the last published version, which is where "คำโปรย (TH)" comes from.
 */
export type ChangeChip =
  | { kind: "field"; field: string }
  | { kind: "translation"; field: string; locale: string };

/**
 * A locale's standing on one record, for the completeness table.
 *
 * "live"    — present now and present in the last published revision.
 * "draft"   — written, but not in what the public site is serving yet.
 * "missing" — no content at all.
 */
export type LocaleState = { locale: string; state: "live" | "draft" | "missing" };

export type PublishingRow = {
  type: PublishableType;
  id: string;
  slug: string;
  title: string;
  contentStatus: ContentStatus;
  isPublished: boolean;
  scheduledPublishAt: Date | null;
  updatedAt: Date;
  /** Locales (from i18n.ts's `locales`) with a non-empty title/name. */
  localesPresent: string[];
  /** The same four locales, split by whether they are live yet. */
  localeStates: LocaleState[];
  /** Populated for review-queue rows only — see changesFor(). */
  changed: ChangeChip[];
  lastActorEmail: string | null;
  lastActorAt: Date | null;
};

/**
 * Workflow bookkeeping rather than content. These are set by the approve/
 * revert actions themselves, so leaving them in would mean every row in
 * review claimed "isPublished changed" — true, and useless to a reviewer
 * deciding whether the copy is right.
 */
const NOISE_FIELDS = new Set([
  "isPublished",
  "contentStatus",
  "scheduledPublishAt",
  "sortOrder",
  "updatedAt",
  "deletedAt",
]);

/** Translation fields worth a chip, in the order a reviewer reads them.
 *  Shared across all four content types — a field a given type's
 *  translation doesn't have (e.g. Project has no `content`) is simply
 *  absent from that type's snapshot, so it never contributes a false
 *  diff; see changesFor()'s own `field in now` guard and
 *  countTranslationDiff()'s undefined-vs-undefined short circuit. */
const TRANSLATION_FIELDS = [
  "name",
  "title",
  "tagline",
  "description",
  "content",
  "excerpt",
  "metaTitle",
  "metaDescription",
  "focusKeyword",
];

/** More than this and the card becomes a wall of chips; the rest is
 *  summarised as "+N more". */
const MAX_CHIPS = 6;

const TYPE_LABEL_KEY: Record<PublishableType, "projects" | "news" | "events" | "eBrochures"> = {
  PROJECT: "projects",
  NEWS_ARTICLE: "news",
  EVENT: "events",
  E_BROCHURE: "eBrochures",
};

export function typeLabelKey(type: PublishableType) {
  return TYPE_LABEL_KEY[type];
}

async function lastActorFor(type: PublishableType, id: string) {
  return prisma.auditLog.findFirst({
    where: { model: AUDIT_MODEL_NAME[type], recordId: id },
    orderBy: { createdAt: "desc" },
    select: { actorEmail: true, createdAt: true },
  });
}

type TranslationLike = { locale: string; title?: string | null; name?: string | null };

/**
 * The last snapshot taken for each record — which is what the public site
 * is serving, because saveRevision() runs at approve-and-publish and at
 * revert, and nowhere else.
 *
 * One query for every row on the page: `distinct` keeps the newest per
 * record because the ordering is applied first.
 */
async function lastPublishedSnapshots(
  pairs: { type: PublishableType; id: string }[],
): Promise<Map<string, { at: Date; translations: TranslationLike[] }>> {
  if (pairs.length === 0) return new Map();

  const rows = await prisma.contentRevision.findMany({
    where: {
      contentType: { in: [...new Set(pairs.map((p) => p.type))] },
      contentId: { in: pairs.map((p) => p.id) },
    },
    orderBy: { createdAt: "desc" },
    distinct: ["contentType", "contentId"],
    select: { contentType: true, contentId: true, createdAt: true, snapshot: true },
  });

  return new Map(
    rows.map((row) => {
      const snapshot = row.snapshot as { translations?: TranslationLike[] } | null;
      return [
        `${row.contentType}:${row.contentId}`,
        { at: row.createdAt, translations: snapshot?.translations ?? [] },
      ];
    }),
  );
}

/**
 * What one type's row builder produces on its own. `localeStates` and
 * `changed` need the published snapshot, which is fetched once for every
 * row on the page rather than per builder — see getPublishingOverview.
 */
type RawRow = Omit<PublishingRow, "localeStates" | "changed"> & {
  translations: TranslationLike[];
};

const filled = (value: unknown) => typeof value === "string" && value.trim().length > 0;

/**
 * Which of the four locales are live, drafted, or absent.
 *
 * The public site serves the *current* row, gated on `isPublished` — there
 * is no per-locale staging — so a locale on an unpublished record is a
 * draft no matter what the revision history says, and a locale on a
 * published record is live unless the last published snapshot proves it
 * was added afterwards.
 *
 * That last clause is why the snapshot is consulted at all, and why its
 * absence must not mean "draft": most records predate this workflow and
 * have no revision, and reporting a published record's languages as drafts
 * would contradict the site-status column right beside them.
 */
function localeStatesFrom(
  current: TranslationLike[],
  published: TranslationLike[] | undefined,
  isPublished: boolean,
): LocaleState[] {
  const has = (rows: TranslationLike[], locale: string) =>
    rows.some((row) => row.locale === locale && filled(row.title ?? row.name));

  return LOCALE_DISPLAY_ORDER.map((locale) => {
    if (!has(current, locale)) return { locale, state: "missing" as const };
    if (!isPublished) return { locale, state: "draft" as const };
    // Published, and either there is no snapshot to contradict it or the
    // snapshot already had this locale.
    if (!published || has(published, locale)) return { locale, state: "live" as const };
    // Present now, absent from what was last published: added since.
    return { locale, state: "draft" as const };
  });
}

/**
 * The chips on a review-queue card.
 *
 * Audit entries are read only from after the last publish, so the card
 * describes the edit awaiting review rather than the record's whole
 * history. The literal field name "translations" — what a nested write
 * records for the whole translation set — is expanded into per-locale
 * chips by diffing the current content against the published snapshot,
 * which is the one place actual values are kept.
 */
async function changesFor(
  type: PublishableType,
  id: string,
  current: TranslationLike[],
  published: { at: Date; translations: TranslationLike[] } | undefined,
): Promise<ChangeChip[]> {
  const entries = await prisma.auditLog.findMany({
    where: {
      model: AUDIT_MODEL_NAME[type],
      recordId: id,
      ...(published ? { createdAt: { gt: published.at } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { changedFields: true },
  });

  const fields = new Set<string>();
  for (const entry of entries) {
    for (const field of entry.changedFields) {
      if (!NOISE_FIELDS.has(field)) fields.add(field);
    }
  }

  const chips: ChangeChip[] = [];

  if (fields.delete("translations")) {
    for (const locale of LOCALE_DISPLAY_ORDER) {
      const now = current.find((row) => row.locale === locale) as Record<string, unknown> | undefined;
      const before = published?.translations.find((row) => row.locale === locale) as
        | Record<string, unknown>
        | undefined;
      if (!now) continue;

      for (const field of TRANSLATION_FIELDS) {
        if (!(field in now)) continue;
        // A field that is empty on both sides never changed; one that
        // differs did, including "filled in for the first time".
        const a = filled(now[field]) ? String(now[field]).trim() : "";
        const b = filled(before?.[field]) ? String(before![field]).trim() : "";
        if (a !== b) chips.push({ kind: "translation", field, locale });
      }
    }
  }

  for (const field of [...fields].sort()) chips.push({ kind: "field", field });

  return chips;
}

function localesFrom(translations: { locale: string; title?: string | null; name?: string | null }[]): string[] {
  return translations
    .filter((row) => (row.title ?? row.name ?? "").trim().length > 0)
    .map((row) => row.locale)
    .filter((locale) => (locales as readonly string[]).includes(locale));
}

async function projectRows(): Promise<RawRow[]> {
  const rows = await prisma.project.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameTh: true,
      contentStatus: true,
      isPublished: true,
      scheduledPublishAt: true,
      updatedAt: true,
      translations: { select: { locale: true, name: true } },
    },
  });

  return Promise.all(
    rows.map(async (row) => {
      const actor = await lastActorFor("PROJECT", row.id);
      return {
        type: "PROJECT" as const,
        id: row.id,
        slug: row.slug,
        title: row.nameTh || row.nameEn,
        contentStatus: row.contentStatus,
        isPublished: row.isPublished,
        scheduledPublishAt: row.scheduledPublishAt,
        updatedAt: row.updatedAt,
        localesPresent: localesFrom(row.translations),
        translations: row.translations,
        lastActorEmail: actor?.actorEmail ?? null,
        lastActorAt: actor?.createdAt ?? null,
      };
    }),
  );
}

async function newsRows(): Promise<RawRow[]> {
  const rows = await prisma.newsArticle.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      titleEn: true,
      titleTh: true,
      contentStatus: true,
      isPublished: true,
      scheduledPublishAt: true,
      updatedAt: true,
      translations: { select: { locale: true, title: true } },
    },
  });

  return Promise.all(
    rows.map(async (row) => {
      const actor = await lastActorFor("NEWS_ARTICLE", row.id);
      return {
        type: "NEWS_ARTICLE" as const,
        id: row.id,
        slug: row.slug,
        title: row.titleTh || row.titleEn,
        contentStatus: row.contentStatus,
        isPublished: row.isPublished,
        scheduledPublishAt: row.scheduledPublishAt,
        updatedAt: row.updatedAt,
        localesPresent: localesFrom(row.translations),
        translations: row.translations,
        lastActorEmail: actor?.actorEmail ?? null,
        lastActorAt: actor?.createdAt ?? null,
      };
    }),
  );
}

async function eventRows(): Promise<RawRow[]> {
  const rows = await prisma.event.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      titleEn: true,
      titleTh: true,
      contentStatus: true,
      isPublished: true,
      scheduledPublishAt: true,
      updatedAt: true,
      translations: { select: { locale: true, title: true } },
    },
  });

  return Promise.all(
    rows.map(async (row) => {
      const actor = await lastActorFor("EVENT", row.id);
      return {
        type: "EVENT" as const,
        id: row.id,
        slug: row.slug,
        title: row.titleTh || row.titleEn,
        contentStatus: row.contentStatus,
        isPublished: row.isPublished,
        scheduledPublishAt: row.scheduledPublishAt,
        updatedAt: row.updatedAt,
        localesPresent: localesFrom(row.translations),
        translations: row.translations,
        lastActorEmail: actor?.actorEmail ?? null,
        lastActorAt: actor?.createdAt ?? null,
      };
    }),
  );
}

async function brochureRows(): Promise<RawRow[]> {
  const rows = await prisma.eBrochure.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      slug: true,
      contentStatus: true,
      isPublished: true,
      scheduledPublishAt: true,
      updatedAt: true,
      translations: { select: { locale: true, title: true } },
    },
  });

  return Promise.all(
    rows.map(async (row) => {
      const actor = await lastActorFor("E_BROCHURE", row.id);
      const thTitle = row.translations.find((t) => t.locale === "th")?.title;
      const enTitle = row.translations.find((t) => t.locale === "en")?.title;
      return {
        type: "E_BROCHURE" as const,
        id: row.id,
        slug: row.slug,
        title: thTitle || enTitle || row.slug,
        contentStatus: row.contentStatus,
        isPublished: row.isPublished,
        scheduledPublishAt: row.scheduledPublishAt,
        updatedAt: row.updatedAt,
        localesPresent: localesFrom(row.translations),
        translations: row.translations,
        lastActorEmail: actor?.actorEmail ?? null,
        lastActorAt: actor?.createdAt ?? null,
      };
    }),
  );
}

export type RevisionHistoryItem = {
  id: string;
  /** 1-based, oldest first, so the numbers never shift as history grows. */
  version: number;
  createdAt: Date;
  createdByName: string | null;
  /** Translation fields that differ from the version before it. The oldest
   *  revision has nothing to compare against and reports null. */
  changedFieldCount: number | null;
  /** The newest revision is what saveRevision() last captured, which is
   *  what the public site is serving. */
  isLive: boolean;
  /** "link_opportunity" for a Phase 5 automated link-insertion edit; null
   *  for every human-triggered approve/revert. */
  source: string | null;
};

/** How long revisions are kept — see the note this figure is shown with.
 *  Nothing prunes them yet; this is the stated policy, not a running job. */
export const REVISION_RETENTION_DAYS = 90;

/**
 * Version history for one record, for the panel beside the review queue.
 *
 * Field counts are computed by diffing each snapshot against the one
 * before it, which is possible here (and not for the audit trail) because
 * ContentRevision keeps the translation content itself.
 */
export async function getRevisionHistory(
  type: PublishableType,
  id: string,
  take = 8,
): Promise<RevisionHistoryItem[]> {
  return safeQuery(
    "publishing:revisionHistory",
    async () => {
      const rows = await prisma.contentRevision.findMany({
        where: { contentType: type, contentId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, createdAt: true, snapshot: true, source: true, createdBy: { select: { name: true } } },
      });

      const items = rows.map((row, index) => {
        const current = (row.snapshot as { translations?: TranslationLike[] } | null)?.translations ?? [];
        const previous =
          index === 0
            ? null
            : ((rows[index - 1].snapshot as { translations?: TranslationLike[] } | null)?.translations ?? []);

        return {
          id: row.id,
          version: index + 1,
          createdAt: row.createdAt,
          createdByName: row.createdBy?.name ?? null,
          changedFieldCount: previous === null ? null : countTranslationDiff(current, previous),
          isLive: index === rows.length - 1,
          source: row.source,
        };
      });

      // Newest first for display, but numbered from the oldest.
      return items.reverse().slice(0, take);
    },
    [],
  );
}

/** How many (locale, field) pairs differ between two snapshots. Exported
 *  for a pure unit test (tests/lib/publishing.test.ts) — in particular
 *  that the TRANSLATION_FIELDS widen for news' content/excerpt/
 *  focusKeyword doesn't produce a false diff for a content type that
 *  simply doesn't have those fields (Project, Event, EBrochure). */
export function countTranslationDiff(current: TranslationLike[], previous: TranslationLike[]): number {
  let count = 0;

  for (const locale of LOCALE_DISPLAY_ORDER) {
    const now = current.find((row) => row.locale === locale) as Record<string, unknown> | undefined;
    const before = previous.find((row) => row.locale === locale) as Record<string, unknown> | undefined;
    if (!now && !before) continue;

    for (const field of TRANSLATION_FIELDS) {
      const a = filled(now?.[field]) ? String(now![field]).trim() : "";
      const b = filled(before?.[field]) ? String(before![field]).trim() : "";
      if (a !== b) count += 1;
    }
  }

  return count;
}

export type PublishingOverview = {
  draftCount: number;
  draftOldestDays: number | null;
  reviewCount: number;
  reviewAvgWaitDays: number | null;
  scheduledCount: number;
  scheduledNext: Date | null;
  publishedThisWeekCount: number;
  /** Everything not PUBLISHED, oldest-touched first — the actual queue. */
  reviewQueue: PublishingRow[];
  /** All rows, capped, for the completeness table. */
  allRows: PublishingRow[];
};

const EMPTY_OVERVIEW: PublishingOverview = {
  draftCount: 0,
  draftOldestDays: null,
  reviewCount: 0,
  reviewAvgWaitDays: null,
  scheduledCount: 0,
  scheduledNext: null,
  publishedThisWeekCount: 0,
  reviewQueue: [],
  allRows: [],
};

const TABLE_CAP = 50;

export async function getPublishingOverview(): Promise<PublishingOverview> {
  return safeQuery(
    "getPublishingOverview",
    async () => {
      const [projects, news, events, brochures] = await Promise.all([
        projectRows(),
        newsRows(),
        eventRows(),
        brochureRows(),
      ]);
      const raw = [...projects, ...news, ...events, ...brochures];

      // One query for every row's published snapshot, then the locale
      // states are pure computation on top of it.
      const published = await lastPublishedSnapshots(
        raw.map((row) => ({ type: row.type, id: row.id })),
      );

      // Kept beside the rows rather than on them: translations are an
      // input to the two computed fields, not something the page renders.
      const translationsByKey = new Map(
        raw.map((row) => [`${row.type}:${row.id}`, row.translations]),
      );

      const all: PublishingRow[] = raw.map(({ translations, ...row }) => ({
        ...row,
        localeStates: localeStatesFrom(
          translations,
          published.get(`${row.type}:${row.id}`)?.translations,
          row.isPublished,
        ),
        // Filled in below, and only for the queue.
        changed: [],
      }));

      const now = Date.now();
      const drafts = all.filter((r) => r.contentStatus === ContentStatus.DRAFT);
      const inReview = all.filter((r) => r.contentStatus === ContentStatus.IN_REVIEW);
      const scheduled = all.filter(
        (r) => r.scheduledPublishAt !== null && r.contentStatus !== ContentStatus.PUBLISHED,
      );
      const publishedThisWeek = all.filter(
        (r) => r.isPublished && now - r.updatedAt.getTime() <= 7 * 24 * 60 * 60_000,
      );

      const ageInDays = (date: Date) => Math.floor((now - date.getTime()) / (24 * 60 * 60_000));

      const draftOldestDays = drafts.length
        ? Math.max(...drafts.map((r) => ageInDays(r.updatedAt)))
        : null;
      const reviewAvgWaitDays = inReview.length
        ? Math.round(inReview.reduce((sum, r) => sum + ageInDays(r.updatedAt), 0) / inReview.length)
        : null;
      const scheduledNext = scheduled.length
        ? scheduled
            .map((r) => r.scheduledPublishAt as Date)
            .sort((a, b) => a.getTime() - b.getTime())[0]
        : null;

      const reviewQueue = [...drafts, ...inReview].sort(
        (a, b) => a.updatedAt.getTime() - b.updatedAt.getTime(),
      );

      /*
        Chips are computed for the queue only. Every other row on this page
        is either already published (nothing is awaiting review on it) or
        sits in the completeness table, which does not show them — and each
        one costs an audit query, so computing them for all fifty rows
        would be paying for something nobody reads.
      */
      await Promise.all(
        reviewQueue.map(async (row) => {
          const key = `${row.type}:${row.id}`;
          row.changed = await changesFor(
            row.type,
            row.id,
            translationsByKey.get(key) ?? [],
            published.get(key),
          );
        }),
      );

      const allRows = [...all]
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, TABLE_CAP);

      return {
        draftCount: drafts.length,
        draftOldestDays,
        reviewCount: inReview.length,
        reviewAvgWaitDays,
        scheduledCount: scheduled.length,
        scheduledNext,
        publishedThisWeekCount: publishedThisWeek.length,
        reviewQueue,
        allRows,
      };
    },
    EMPTY_OVERVIEW,
  );
}
