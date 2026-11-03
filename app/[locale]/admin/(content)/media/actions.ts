"use server";

/**
 * app/[locale]/admin/media/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server actions for the media library: register an uploaded object as a
 * Media row, edit its alt text/tags, delete it, and (for
 * components/admin/InsertImageModal.tsx) fetch the library on demand from
 * inside a client component that has no server-rendered page props to
 * read it from.
 *
 * EDITOR and above — the same floor as every other content upload
 * (ImageUploader's presign route requires Role.EDITOR too), since a media
 * library entry is exactly as sensitive as the photo it wraps.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { deleteS3Object, objectKeyFromUrl } from "@/lib/s3";
import { findMediaUsage, findMediaUsageForUrls, isMediaUrlInUse, type MediaUsageRef } from "@/lib/media-usage";
import { after } from "next/server";
import { AltError, aiAltProvider, isAiAltConfigured } from "@/lib/ai-alt";
import { altAfterUpload, fillAlt, imagesMissingAlt, setAiAltOnUpload } from "@/lib/media-ai-alt";
import { getMediaLibrary, type MediaLibraryData } from "@/lib/media";
import { mediaCreateSchema, mediaDeleteSchema, mediaMetaSchema } from "@/lib/validations";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateMedia(locale: string) {
  revalidatePath(`/${locale}/admin/media`);
}

/**
 * Called right after the browser's presigned PUT succeeds — see
 * components/admin/MediaUploadButton.tsx. The object already exists in the
 * bucket by this point; this only records it so the library can find it
 * again.
 */
export async function createMedia(
  locale: string,
  input: unknown,
): Promise<ActionResult & { id?: string }> {
  const actor = await requireAdminAction(Role.EDITOR);

  const parsed = mediaCreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "VALIDATION_FAILED" };

  const { url, mimeType, width, height, sizeBytes, tags } = parsed.data;

  /*
    The object key comes from the URL, not from the browser. deleteMedia
    deletes by key, and a client-sent key that named a different, live
    object would have deleted that one instead. A URL that is not in our
    bucket has no key, so deleting its row never touches the bucket.
  */
  const key = objectKeyFromUrl(url);

  const media = await prisma.media.create({
    data: {
      url,
      key,
      mimeType: mimeType || null,
      width: width ?? null,
      height: height ?? null,
      sizeBytes: sizeBytes ?? null,
      tags,
      uploadedBy: actor.id,
    },
    select: { id: true },
  });

  // "AI alt ตอนอัปโหลด": after the response, so the upload is not kept
  // waiting on the model. Checks the switch itself.
  if (isAiAltConfigured()) after(() => altAfterUpload(media.id));

  revalidateMedia(locale);
  return { ok: true, id: media.id };
}

export async function updateMediaMeta(locale: string, input: unknown): Promise<ActionResult> {
  await requireAdminAction(Role.EDITOR);

  const parsed = mediaMetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "VALIDATION_FAILED" };

  const { id, altText, tags } = parsed.data;

  // Empty strings are real "cleared this locale" values, not "field
  // omitted" — stored as-is rather than dropped, same convention as every
  // other nullable text field in this schema.
  try {
    await prisma.media.update({
      where: { id },
      data: { altText, tags },
    });
  } catch {
    return { ok: false, error: "NOT_FOUND" };
  }

  revalidateMedia(locale);
  return { ok: true };
}

export async function deleteMedia(locale: string, input: unknown): Promise<ActionResult> {
  await requireAdminAction(Role.EDITOR);

  const parsed = mediaDeleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "VALIDATION_FAILED" };

  const media = await prisma.media.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, url: true, key: true },
  });
  if (!media) return { ok: false, error: "NOT_FOUND" };

  // Re-checked here, not trusted from whatever the client last rendered —
  // another admin could have just wired this exact photo into a new
  // project in the seconds since the panel opened.
  if (await isMediaUrlInUse(media.url)) {
    return { ok: false, error: "IN_USE" };
  }

  // Re-derived from the URL rather than trusting the stored key: rows saved
  // before createMedia stopped accepting the client's key may not match.
  const objectKey = objectKeyFromUrl(media.url);
  if (objectKey) {
    try {
      await deleteS3Object(objectKey);
    } catch (error) {
      // Best-effort — see deleteS3Object's own comment. The library entry
      // still goes away; an orphaned object is a smaller problem than a
      // row nobody can ever remove.
      console.error("[deleteMedia] failed to delete S3 object", objectKey, error);
    }
  }

  await prisma.media.delete({ where: { id: media.id } });

  revalidateMedia(locale);
  return { ok: true };
}

/**
 * Usage is scanned on demand for one file at a time (see lib/media-usage.ts)
 * rather than for the whole grid up front — a few dozen table scans per
 * click is fine; times a few hundred thumbnails on every page load is not.
 */
export async function getMediaUsage(id: string): Promise<MediaUsageRef[]> {
  await requireAdminAction(Role.EDITOR);

  const media = await prisma.media.findUnique({ where: { id }, select: { url: true } });
  if (!media) return [];

  return findMediaUsage(media.url);
}

/**
 * The same read lib/media.ts's getMediaLibrary() already powers the
 * standalone /admin/media page with, callable from a client component
 * instead of read off server-rendered props — InsertImageModal opens
 * from inside NewsForm, which has no page-load props of its own to carry
 * this in. `createdAt` is turned into a string here rather than left a
 * Date: this crosses a "use server" boundary, and a plain ISO string is
 * one less serialization detail for a caller to get wrong.
 */
export async function fetchMediaLibrary(): Promise<
  Omit<MediaLibraryData, "items"> & { items: (Omit<MediaLibraryData["items"][number], "createdAt"> & { createdAt: string })[] }
> {
  await requireAdminAction(Role.EDITOR);

  const data = await getMediaLibrary();
  return {
    ...data,
    items: data.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
  };
}

export type AiAltResult =
  | {
      ok: true;
      written: number;
      failed: { id: string; error: string }[];
      /** Still missing after this batch, not counting `skip`. */
      remaining: number;
      /** The rows as saved, so the grid updates without a reload. */
      updated: { id: string; altText: Record<string, string> }[];
      /** Set when the provider said slow down: wait this long, then go on. */
      retryAfterSec?: number;
    }
  | { ok: false; error: "NOT_CONFIGURED" | "FAILED" };

/** Stop starting new images after this long, to finish inside the proxy's 60 s. */
const AI_ALT_BUDGET_MS = 40_000;
const AI_ALT_MAX_PER_CALL = 8;

/**
 * One batch of "AI เขียน alt ที่ขาด". The page calls it in a loop, showing
 * done/total, until nothing is left or the admin stops it. `ids` limits it
 * to those images (the panel button); `skip` is what already failed this
 * run, so a broken file is not retried forever. Calls are paced by
 * lib/ai-alt.ts for the free tier; on a 429 the batch ends early with
 * retryAfterSec and the page waits.
 */
export async function generateMissingAltText(
  locale: string,
  ids?: string[],
  skip: string[] = [],
): Promise<AiAltResult> {
  await requireAdminAction(Role.EDITOR);
  if (!isAiAltConfigured()) return { ok: false, error: "NOT_CONFIGURED" };

  try {
    const started = Date.now();
    const missing = (await imagesMissingAlt(skip.slice(0, 2000))).filter((row) => !ids?.length || ids.includes(row.id));
    const usage = await findMediaUsageForUrls(missing.slice(0, AI_ALT_MAX_PER_CALL).map((row) => row.url));

    const failed: { id: string; error: string }[] = [];
    const updated: { id: string; altText: Record<string, string> }[] = [];
    let retryAfterSec: number | undefined;

    for (const row of missing.slice(0, AI_ALT_MAX_PER_CALL)) {
      if (Date.now() - started > AI_ALT_BUDGET_MS) break;
      try {
        const usedOn = (usage.get(row.url) ?? []).map((ref) => ref.label);
        updated.push({ id: row.id, altText: await fillAlt(row, usedOn) });
      } catch (error) {
        if (error instanceof AltError && error.code === "RATE_LIMIT") {
          retryAfterSec = error.retryAfterSec ?? 60;
          break;
        }
        failed.push({
          id: row.id,
          error: error instanceof AltError ? `${error.code}: ${error.message}` : String(error),
        });
      }
    }

    if (updated.length) revalidateMedia(locale);
    return {
      ok: true,
      written: updated.length,
      failed,
      remaining: missing.length - updated.length - failed.length,
      updated,
      ...(retryAfterSec !== undefined && { retryAfterSec }),
    };
  } catch (error) {
    console.error("[generateMissingAltText]", error);
    return { ok: false, error: "FAILED" };
  }
}

/** The "AI alt ตอนอัปโหลด" switch. */
export async function toggleAiAltOnUpload(locale: string, on: boolean): Promise<ActionResult> {
  const actor = await requireAdminAction(Role.EDITOR);
  if (on && !aiAltProvider()) return { ok: false, error: "NOT_CONFIGURED" };
  try {
    await setAiAltOnUpload(on, actor.id);
    revalidateMedia(locale);
    return { ok: true };
  } catch (error) {
    console.error("[toggleAiAltOnUpload]", error);
    return { ok: false, error: "FAILED" };
  }
}

export type DeleteUnusedResult =
  | { ok: true; deleted: number; skipped: number; deletedIds: string[] }
  | { ok: false; error: string };

/**
 * "ลบรูปที่ไม่ได้ใช้": every library file nothing on the site references.
 * Usage is re-scanned here, not taken from the grid — something may have
 * been wired to one of them since the page loaded — and each file is
 * checked once more just before it goes. Bucket object first, then row,
 * the same order and best-effort rule as deleteMedia. ADMIN and above: it
 * is the one action on this page that removes many files at once.
 */
export async function deleteUnusedMedia(locale: string): Promise<DeleteUnusedResult> {
  await requireAdminAction(Role.ADMIN);

  try {
    // Images only, as the button says: an unused brochure PDF is a
    // decision for the e-brochure screen, not a bulk clean-up.
    const rows = await prisma.media.findMany({
      where: { OR: [{ mimeType: { startsWith: "image/" } }, { mimeType: null }] },
      select: { id: true, url: true },
    });
    const usage = await findMediaUsageForUrls(rows.map((row) => row.url));
    const unused = rows.filter((row) => (usage.get(row.url) ?? []).length === 0);

    const deletedIds: string[] = [];
    let skipped = 0;
    for (const row of unused) {
      if (await isMediaUrlInUse(row.url)) {
        skipped += 1;
        continue;
      }
      const objectKey = objectKeyFromUrl(row.url);
      if (objectKey) {
        try {
          await deleteS3Object(objectKey);
        } catch (error) {
          console.error("[deleteUnusedMedia] failed to delete S3 object", objectKey, error);
        }
      }
      await prisma.media.delete({ where: { id: row.id } });
      deletedIds.push(row.id);
    }

    revalidateMedia(locale);
    return { ok: true, deleted: deletedIds.length, skipped, deletedIds };
  } catch (error) {
    console.error("[deleteUnusedMedia]", error);
    return { ok: false, error: "FAILED" };
  }
}
