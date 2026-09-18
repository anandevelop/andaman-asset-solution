"use server";

/**
 * app/[locale]/admin/publishing/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The draft → review → publish state machine. Everything here changes
 * `contentStatus` (see prisma/schema.prisma's ContentStatus comment); only
 * approveAndPublish and revertToRevision also touch `isPublished` or a
 * row's translated content — every other content edit still goes through
 * each type's own existing edit action (updateProject, updateArticle, …),
 * gated at the isPublished level by lib/publishing-gate.ts.
 *
 * Role floor: EDITOR can move a row into the workflow (startDraft) and
 * send it on for review (submitForReview) — that is the content author's
 * side of the process. Approving, rejecting and reverting are ADMIN and
 * above, the same floor as SEO and Settings: publishing something is a
 * step above writing it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { ContentStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { notifyAdmins } from "@/lib/notifications";
import { locales } from "@/i18n";
import {
  PUBLISHABLE_TYPES,
  restoreContent,
  saveRevision,
  snapshotContent,
  type PublishableType,
} from "@/lib/content-revisions";
import { getRevisionHistory, type RevisionHistoryItem } from "@/lib/publishing";

export type ActionResult = { ok: true } | { ok: false; error: string };

/* Not exported: a "use server" module may only export async functions, and
   Next refuses to compile the whole route if it exports anything else.
   Nothing outside this file uses it. */
function isPublishableType(value: string): value is PublishableType {
  return (PUBLISHABLE_TYPES as string[]).includes(value);
}

type Row = { id: string; slug: string; contentStatus: ContentStatus; isPublished: boolean; publishedAt: Date | null };

async function findRow(type: PublishableType, id: string): Promise<Row | null> {
  const select = { id: true, slug: true, contentStatus: true, isPublished: true, publishedAt: true } as const;
  switch (type) {
    case "PROJECT":
      return prisma.project.findUnique({ where: { id }, select });
    case "NEWS_ARTICLE":
      return prisma.newsArticle.findUnique({ where: { id }, select });
    case "EVENT":
      return prisma.event.findUnique({ where: { id }, select });
    case "E_BROCHURE":
      return prisma.eBrochure.findUnique({ where: { id }, select });
  }
}

async function writeStatus(
  type: PublishableType,
  id: string,
  data: { contentStatus: ContentStatus; isPublished?: boolean; publishedAt?: Date },
): Promise<void> {
  switch (type) {
    case "PROJECT":
      await prisma.project.update({ where: { id }, data });
      return;
    case "NEWS_ARTICLE":
      await prisma.newsArticle.update({ where: { id }, data });
      return;
    case "EVENT":
      await prisma.event.update({ where: { id }, data });
      return;
    case "E_BROCHURE":
      await prisma.eBrochure.update({ where: { id }, data });
      return;
  }
}

const PUBLIC_LIST_PATH: Record<PublishableType, string> = {
  PROJECT: "projects",
  NEWS_ARTICLE: "news",
  EVENT: "events",
  E_BROCHURE: "e-brochure",
};

function revalidateAfterChange(locale: string, type: PublishableType, slug: string) {
  revalidatePath(`/${locale}/admin/publishing`);

  const listSegment = PUBLIC_LIST_PATH[type];
  for (const target of locales) {
    revalidatePath(`/${target}/${listSegment}`);
    // No per-slug public page for e-brochures — they are viewed from the
    // index, not a dedicated /e-brochure/[slug] route.
    if (type !== "E_BROCHURE") revalidatePath(`/${target}/${listSegment}/${slug}`);
  }
}

/** PUBLISHED → DRAFT. The entry point into the workflow — nothing else
 *  moves a row out of PUBLISHED, since every row defaults there and nnone
 *  of the four content types' own edit forms touch contentStatus. */
export async function startDraft(locale: string, type: string, id: string): Promise<ActionResult> {
  await requireAdminAction(Role.EDITOR);
  if (!isPublishableType(type)) return { ok: false, error: "INVALID_TYPE" };

  const row = await findRow(type, id);
  if (!row) return { ok: false, error: "NOT_FOUND" };

  try {
    await writeStatus(type, id, { contentStatus: ContentStatus.DRAFT });
  } catch {
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidateAfterChange(locale, type, row.slug);
  return { ok: true };
}

/** DRAFT → IN_REVIEW. */
export async function submitForReview(locale: string, type: string, id: string): Promise<ActionResult> {
  await requireAdminAction(Role.EDITOR);
  if (!isPublishableType(type)) return { ok: false, error: "INVALID_TYPE" };

  const row = await findRow(type, id);
  if (!row) return { ok: false, error: "NOT_FOUND" };
  if (row.contentStatus !== ContentStatus.DRAFT) return { ok: false, error: "WRONG_STATE" };

  try {
    await writeStatus(type, id, { contentStatus: ContentStatus.IN_REVIEW });
  } catch {
    return { ok: false, error: "SAVE_FAILED" };
  }

  // Whoever can actually approve it is told, if that switch is on. After
  // the write, so a notification failure cannot lose the submission.
  void notifyAdmins({
    event: "contentInReview",
    title: row.slug,
    href: `/admin/publishing`,
  });

  revalidateAfterChange(locale, type, row.slug);
  return { ok: true };
}

/** IN_REVIEW → DRAFT — "ตีกลับ" (send back). */
export async function sendBackToDraft(locale: string, type: string, id: string): Promise<ActionResult> {
  await requireAdminAction(Role.ADMIN);
  if (!isPublishableType(type)) return { ok: false, error: "INVALID_TYPE" };

  const row = await findRow(type, id);
  if (!row) return { ok: false, error: "NOT_FOUND" };
  if (row.contentStatus !== ContentStatus.IN_REVIEW) return { ok: false, error: "WRONG_STATE" };

  try {
    await writeStatus(type, id, { contentStatus: ContentStatus.DRAFT });
  } catch {
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidateAfterChange(locale, type, row.slug);
  return { ok: true };
}

/**
 * IN_REVIEW → PUBLISHED, and isPublished → true. Also the moment a
 * revision is saved: the snapshot taken here is what "compare to
 * published" and a future revert both read back — see
 * lib/content-revisions.ts.
 *
 * publishedAt is filled in here too, but only when missing — a row that
 * reaches PUBLISHED with publishedAt still null would be isPublished:true
 * yet permanently invisible, since every public read filters on
 * publishedAt <= now (see lib/news.ts's publishedWhere()). An admin who
 * already scheduled a future date before submitting for review keeps that
 * exact date; this never overwrites one already set.
 */
export async function approveAndPublish(locale: string, type: string, id: string): Promise<ActionResult> {
  const session = await requireAdminAction(Role.ADMIN);
  if (!isPublishableType(type)) return { ok: false, error: "INVALID_TYPE" };

  const row = await findRow(type, id);
  if (!row) return { ok: false, error: "NOT_FOUND" };
  if (row.contentStatus !== ContentStatus.IN_REVIEW) return { ok: false, error: "WRONG_STATE" };

  try {
    await writeStatus(type, id, {
      contentStatus: ContentStatus.PUBLISHED,
      isPublished: true,
      publishedAt: row.publishedAt ?? new Date(),
    });
    await saveRevision({ contentType: type, contentId: id, createdById: session.id });
    // TODO: notify Google's Indexing API that this URL just went live/changed.
    // TODO: auto-post to LINE OA / Facebook when an article is approved and published.
  } catch {
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidateAfterChange(locale, type, row.slug);
  return { ok: true };
}

/**
 * Restores an older revision's translated content onto the live row, then
 * sends it back to DRAFT — a revert proposes going back, it does not
 * silently overwrite whatever the public site is showing right now (that
 * still needs its own approveAndPublish). See lib/content-revisions.ts's
 * header for the exact scope of what a revision holds.
 */
export async function revertToRevision(locale: string, type: string, id: string, revisionId: string): Promise<ActionResult> {
  const session = await requireAdminAction(Role.ADMIN);
  if (!isPublishableType(type)) return { ok: false, error: "INVALID_TYPE" };

  const row = await findRow(type, id);
  if (!row) return { ok: false, error: "NOT_FOUND" };

  const revision = await prisma.contentRevision.findUnique({ where: { id: revisionId } });
  if (!revision || revision.contentType !== type || revision.contentId !== id) {
    return { ok: false, error: "NOT_FOUND" };
  }

  try {
    await restoreContent(type, id, revision.snapshot);
    await writeStatus(type, id, { contentStatus: ContentStatus.DRAFT });
    await saveRevision({ contentType: type, contentId: id, createdById: session.id });
  } catch {
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidateAfterChange(locale, type, row.slug);
  return { ok: true };
}

export type RevisionListItem = {
  id: string;
  createdAt: Date;
  createdByName: string | null;
  source: string | null;
};

/** Version history for one row — fetched on demand from the client panel
 *  rather than joined into the main dashboard query, the same pattern
 *  MediaLibrary's getMediaUsage already uses for a per-item detail fetch. */
export async function getRevisions(type: string, id: string): Promise<RevisionListItem[]> {
  await requireAdminAction(Role.EDITOR);
  if (!isPublishableType(type)) return [];

  const rows = await prisma.contentRevision.findMany({
    where: { contentType: type, contentId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, createdAt: true, source: true, createdBy: { select: { name: true } } },
  });

  return rows.map((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    createdByName: row.createdBy?.name ?? null,
    source: row.source,
  }));
}

export type RevisionCompare = {
  current: Record<string, unknown>[];
  revision: Record<string, unknown>[] | null;
  revisionCreatedAt: Date | null;
};

/** "เทียบกับที่เผยแพร่อยู่" — the row's current translations against its
 *  most recent revision (the last approved-publish or revert). No
 *  revision yet (nothing has gone through this workflow since the
 *  migration) is reported honestly as `revision: null`, not as a diff
 *  against nothing. */
export async function compareToLastRevision(type: string, id: string): Promise<RevisionCompare | null> {
  await requireAdminAction(Role.EDITOR);
  if (!isPublishableType(type)) return null;

  const [current, lastRevision] = await Promise.all([
    snapshotContent(type, id),
    prisma.contentRevision.findFirst({
      where: { contentType: type, contentId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const revisionSnapshot = lastRevision?.snapshot as { translations?: Record<string, unknown>[] } | null;

  return {
    current: current.translations,
    revision: revisionSnapshot?.translations ?? null,
    revisionCreatedAt: lastRevision?.createdAt ?? null,
  };
}

export type { RevisionHistoryItem };

/** The richer, per-version history (version number, per-version changed-
 *  field count, live marker) lib/publishing.ts already computes for the
 *  review-queue's own history section — exposed here as a server action so
 *  a client component (components/admin/RevisionHistoryModal.tsx) can
 *  fetch it on demand, the same on-open pattern getRevisions() above
 *  already established. Same EDITOR floor as getRevisions/
 *  compareToLastRevision — this is a read. */
export async function getRevisionHistoryList(type: string, id: string): Promise<RevisionHistoryItem[]> {
  await requireAdminAction(Role.EDITOR);
  if (!isPublishableType(type)) return [];
  return getRevisionHistory(type, id);
}
