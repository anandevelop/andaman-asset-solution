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
import { ALT_LOCALES, AltError, draftAltText, isAiAltConfigured } from "@/lib/ai-alt";
import { isAltTextComplete, MIN_ALT_LENGTH } from "@/lib/media-alt";
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
      /** Still missing after this batch — the button shows it and can be pressed again. */
      remaining: number;
      /** The rows as saved, so the grid updates without a reload. */
      updated: { id: string; altText: Record<string, string> }[];
    }
  | { ok: false; error: "NOT_CONFIGURED" | "FAILED" };

/** Per click: small enough to finish well inside the proxy's 60 s. */
const AI_ALT_BATCH = 8;
const AI_ALT_CONCURRENCY = 3;

/**
 * "AI เขียน alt ที่ขาด": draft alt text for images that are missing it in
 * any language (or for `ids`, from one image's panel). Only empty or
 * too-short languages are filled; text a person wrote is never replaced.
 */
export async function generateMissingAltText(locale: string, ids?: string[]): Promise<AiAltResult> {
  await requireAdminAction(Role.EDITOR);
  if (!isAiAltConfigured()) return { ok: false, error: "NOT_CONFIGURED" };

  try {
    const rows = await prisma.media.findMany({
      where: {
        ...(ids?.length ? { id: { in: ids.slice(0, AI_ALT_BATCH) } } : {}),
        // Null for rows registered before the column was filled; the
        // fetch in lib/ai-alt.ts refuses anything that is not an image.
        OR: [{ mimeType: { startsWith: "image/" } }, { mimeType: null }],
      },
      select: { id: true, url: true, tags: true, altText: true },
      orderBy: { createdAt: "desc" },
    });
    const missing = rows.filter(
      (row) => !isAltTextComplete(row.altText as Record<string, string> | null, ALT_LOCALES),
    );
    const batch = missing.slice(0, AI_ALT_BATCH);

    const usage = await findMediaUsageForUrls(batch.map((row) => row.url));
    const failed: { id: string; error: string }[] = [];
    const updated: { id: string; altText: Record<string, string> }[] = [];

    let next = 0;
    async function worker() {
      while (next < batch.length) {
        const row = batch[next++];
        try {
          const usedOn = (usage.get(row.url) ?? []).map((ref) => ref.label).filter(Boolean);
          const draft = await draftAltText(row.url, { tags: row.tags, usedOn });
          const current = (row.altText ?? {}) as Record<string, string>;
          const merged: Record<string, string> = { ...current };
          for (const lang of ALT_LOCALES) {
            if ((current[lang] ?? "").trim().length < MIN_ALT_LENGTH) merged[lang] = draft[lang];
          }
          await prisma.media.update({ where: { id: row.id }, data: { altText: merged } });
          updated.push({ id: row.id, altText: merged });
        } catch (error) {
          failed.push({
            id: row.id,
            error: error instanceof AltError ? `${error.code}: ${error.message}` : String(error),
          });
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(AI_ALT_CONCURRENCY, batch.length) }, worker));

    if (updated.length) revalidateMedia(locale);
    return {
      ok: true,
      written: updated.length,
      failed,
      remaining: missing.length - updated.length,
      updated,
    };
  } catch (error) {
    console.error("[generateMissingAltText]", error);
    return { ok: false, error: "FAILED" };
  }
}
