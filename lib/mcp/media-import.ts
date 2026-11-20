/**
 * lib/mcp/media-import.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The background half of an image upload from an AI client (job kind
 * "media.import"): download the image from the address given, make sure it
 * really is an image we accept, store it in the bucket and add it to the
 * media library.
 *
 * What the file *is* comes from decoding it, never from the sender's
 * Content-Type or the URL's extension: sharp reads the bytes and says
 * "jpeg", "png", "webp" or "avif", or it throws and the job fails. An SVG
 * or an HTML page labelled image/png is refused here.
 *
 * The alt text follows the library's own setting: when "AI alt on upload"
 * is on, altAfterUpload() drafts the languages the client did not supply.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import sharp, { type Metadata } from "sharp";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { buildObjectKey, isS3Configured, MAX_UPLOAD_BYTES, putS3Object, type AllowedContentType } from "@/lib/s3";
import { altAfterUpload } from "@/lib/media-ai-alt";
import { registerJob } from "@/lib/mcp/jobs";
import { downloadPublicFile } from "@/lib/mcp/safe-fetch";
import { locales } from "@/i18n";

export const MEDIA_IMPORT_JOB = "media.import";

const FORMATS: Record<string, AllowedContentType> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heif: "image/avif",
  avif: "image/avif",
};

export const mediaImportPayload = z.object({
  url: z.string().url().max(2000),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  altText: z.record(z.string(), z.string().trim().max(300)).default({}),
});

export type MediaImportResult = { mediaId: string; url: string; width: number | null; height: number | null; sizeBytes: number; mimeType: string };

export async function importMedia(payload: unknown, createdById: string | null): Promise<MediaImportResult> {
  const { url, tags, altText } = mediaImportPayload.parse(payload);
  if (!isS3Configured()) throw new Error("STORAGE_NOT_CONFIGURED");

  const file = await downloadPublicFile(url, { maxBytes: MAX_UPLOAD_BYTES });

  let meta: Metadata;
  try {
    meta = await sharp(file.body, { failOn: "error" }).metadata();
  } catch {
    throw new Error("NOT_AN_IMAGE:the file could not be read as an image");
  }
  const mimeType = FORMATS[meta.format ?? ""];
  if (!mimeType) throw new Error(`UNSUPPORTED_IMAGE_TYPE:${meta.format ?? "unknown"} (accepted: JPEG, PNG, WebP, AVIF)`);

  const key = buildObjectKey(mimeType, { prefix: "media", slug: "ai" });
  const publicUrl = await putS3Object({ key, body: file.body, contentType: mimeType });

  const allowed = new Set<string>(locales);
  const alt = Object.fromEntries(Object.entries(altText).filter(([locale, text]) => allowed.has(locale) && text));

  const media = await prisma.media.create({
    data: {
      url: publicUrl,
      key,
      mimeType,
      width: meta.width ?? null,
      height: meta.height ?? null,
      sizeBytes: file.body.length,
      tags,
      altText: Object.keys(alt).length ? alt : undefined,
      uploadedBy: createdById,
    },
    select: { id: true },
  });

  // Drafts whichever languages are still empty, if the library is set to.
  await altAfterUpload(media.id).catch((error) => console.error("[media-import] alt text", error));

  try {
    for (const locale of locales) revalidatePath(`/${locale}/admin/media`);
  } catch {
    /* Outside a request there is nothing to revalidate; the page is dynamic anyway. */
  }

  return { mediaId: media.id, url: publicUrl, width: meta.width ?? null, height: meta.height ?? null, sizeBytes: file.body.length, mimeType };
}

registerJob(MEDIA_IMPORT_JOB, (payload, job) => importMedia(payload, job.createdById));
