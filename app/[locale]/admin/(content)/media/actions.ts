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
import { deleteS3Object } from "@/lib/s3";
import { findMediaUsage, isMediaUrlInUse, type MediaUsageRef } from "@/lib/media-usage";
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

  const { url, key, mimeType, width, height, sizeBytes, tags } = parsed.data;

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

  if (media.key) {
    try {
      await deleteS3Object(media.key);
    } catch (error) {
      // Best-effort — see deleteS3Object's own comment. The library entry
      // still goes away; an orphaned object is a smaller problem than a
      // row nobody can ever remove.
      console.error("[deleteMedia] failed to delete S3 object", media.key, error);
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
