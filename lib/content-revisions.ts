import "server-only";

/**
 * lib/content-revisions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Snapshot / restore for the draft → review → publish workflow's version
 * history (ContentRevision, see prisma/schema.prisma).
 *
 * Scoped to translations only — not the full row. Every one of the four
 * content types' own scalar columns are either operational (sortOrder,
 * coordinates, capacity, a project's ProjectStatus) rather than editorial,
 * or a deprecated single-language column no query layer reads any more
 * (see each model's "@deprecated — superseded by *Translation" comment).
 * The actual editable copy — what ContentEditor.dc.html's 4-language
 * compare view and this workflow's "compare to published" are both about
 * — lives entirely in each type's *Translation table. Snapshotting that
 * and nothing else is not a shortcut around a bigger feature; it is the
 * whole feature, honestly scoped to the data that is actually content.
 *
 * One generic implementation across four differently-shaped Prisma
 * delegates, rather than four near-identical copies — the `as any` casts
 * below are the cost of that, and are safe because every value written
 * back came from that same model's own translation table moments earlier.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PublishableType = "PROJECT" | "NEWS_ARTICLE" | "EVENT" | "E_BROCHURE";

export const PUBLISHABLE_TYPES: PublishableType[] = ["PROJECT", "NEWS_ARTICLE", "EVENT", "E_BROCHURE"];

/** Prisma model name for AuditLog's `model` column — see lib/publishing.ts. */
export const AUDIT_MODEL_NAME: Record<PublishableType, string> = {
  PROJECT: "Project",
  NEWS_ARTICLE: "NewsArticle",
  EVENT: "Event",
  E_BROCHURE: "EBrochure",
};

type TranslationRow = { locale: string } & Record<string, unknown>;

export type ContentSnapshot = { translations: TranslationRow[] };

const STRIP_KEYS = new Set(["id", "createdAt", "updatedAt", "projectId", "articleId", "eventId", "brochureId", "locale"]);

function stripRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (!STRIP_KEYS.has(key)) out[key] = value;
  }
  return out;
}

async function readTranslations(type: PublishableType, id: string): Promise<TranslationRow[]> {
  switch (type) {
    case "PROJECT": {
      const rows = await prisma.projectTranslation.findMany({ where: { projectId: id } });
      return rows.map((row) => ({ locale: row.locale, ...stripRow(row) }));
    }
    case "NEWS_ARTICLE": {
      const rows = await prisma.newsArticleTranslation.findMany({ where: { articleId: id } });
      return rows.map((row) => ({ locale: row.locale, ...stripRow(row) }));
    }
    case "EVENT": {
      const rows = await prisma.eventTranslation.findMany({ where: { eventId: id } });
      return rows.map((row) => ({ locale: row.locale, ...stripRow(row) }));
    }
    case "E_BROCHURE": {
      const rows = await prisma.eBrochureTranslation.findMany({ where: { brochureId: id } });
      return rows.map((row) => ({ locale: row.locale, ...stripRow(row) }));
    }
  }
}

async function writeTranslations(type: PublishableType, id: string, rows: TranslationRow[]): Promise<void> {
  for (const row of rows) {
    const { locale, ...fields } = row;

    switch (type) {
      case "PROJECT":
        await prisma.projectTranslation.upsert({
          where: { projectId_locale: { projectId: id, locale: locale as never } },
          update: fields as never,
          create: { projectId: id, locale: locale as never, ...(fields as object) } as never,
        });
        break;
      case "NEWS_ARTICLE":
        await prisma.newsArticleTranslation.upsert({
          where: { articleId_locale: { articleId: id, locale: locale as never } },
          update: fields as never,
          create: { articleId: id, locale: locale as never, ...(fields as object) } as never,
        });
        break;
      case "EVENT":
        await prisma.eventTranslation.upsert({
          where: { eventId_locale: { eventId: id, locale: locale as never } },
          update: fields as never,
          create: { eventId: id, locale: locale as never, ...(fields as object) } as never,
        });
        break;
      case "E_BROCHURE":
        await prisma.eBrochureTranslation.upsert({
          where: { brochureId_locale: { brochureId: id, locale: locale as never } },
          update: fields as never,
          create: { brochureId: id, locale: locale as never, ...(fields as object) } as never,
        });
        break;
    }
  }
}

export async function snapshotContent(type: PublishableType, id: string): Promise<ContentSnapshot> {
  return { translations: await readTranslations(type, id) };
}

/** Writes a snapshot's translations back onto the live row. Only restores
 *  locales the snapshot actually has — a locale added after the snapshot
 *  was taken is left alone, not deleted. */
export async function restoreContent(type: PublishableType, id: string, snapshot: unknown): Promise<void> {
  const rows = (snapshot as Partial<ContentSnapshot> | null)?.translations;
  if (!Array.isArray(rows)) return;
  await writeTranslations(type, id, rows);
}

/** Records the row's current translations as a new revision. Called at
 *  the moments the workflow actually changes what is live or what is
 *  being proposed: approve-and-publish, revert, and (Phase 5) an
 *  automated link-insertion edit — see `source` below. */
export async function saveRevision(params: {
  contentType: PublishableType;
  contentId: string;
  createdById: string | null;
  /** "link_opportunity" for an automated edit; omitted (null) for the
   *  two original, human-triggered call sites. */
  source?: string | null;
}): Promise<void> {
  const snapshot = await snapshotContent(params.contentType, params.contentId);
  await prisma.contentRevision.create({
    data: {
      contentType: params.contentType,
      contentId: params.contentId,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
      createdById: params.createdById,
      source: params.source ?? null,
    },
  });
}
