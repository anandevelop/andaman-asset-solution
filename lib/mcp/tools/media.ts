/**
 * lib/mcp/tools/media.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The media library for an AI client: look, upload, describe, and ask to
 * remove.
 *
 * Uploading does not wait. media_upload queues the work (lib/mcp/
 * media-import.ts) and answers with a job id; the client polls job_status.
 *
 * Removing follows the deletion rule. media_delete records a request and
 * returns a code; the image is gone only after the client's user has said
 * yes and the client calls confirm_deletion. An image that is still shown
 * somewhere on the site is refused outright, and is checked again at the
 * moment of deletion, because five minutes is long enough for somebody to
 * start using it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { defineTool } from "@/lib/mcp/registry";
import { getMediaLibrary } from "@/lib/media";
import { isAltTextComplete } from "@/lib/media-alt";
import { findMediaUsage, findMediaUsageForUrls, isMediaUrlInUse } from "@/lib/media-usage";
import { deleteS3Object, objectKeyFromUrl } from "@/lib/s3";
import { locales } from "@/i18n";
import { enqueueJob } from "@/lib/mcp/jobs";
import { MEDIA_IMPORT_JOB } from "@/lib/mcp/media-import";
import { parsePublicHttpsUrl, UnsafeUrlError } from "@/lib/mcp/safe-fetch";
import { registerDeletion, requestDeletion } from "@/lib/mcp/deletions";
import { updateMediaMeta } from "@/app/[locale]/admin/(content)/media/actions";

const altInput = z
  .object({
    en: z.string().trim().max(300).optional(),
    th: z.string().trim().max(300).optional(),
    zh: z.string().trim().max(300).optional(),
    ru: z.string().trim().max(300).optional(),
  })
  .strict();
const tagsInput = z.array(z.string().trim().min(1).max(40)).max(20);
const fileName = (url: string) => decodeURIComponent(url.split("/").pop() ?? url);

defineTool({
  name: "media_list",
  title: "List media library",
  description:
    "Images and files in the media library, newest first. Each item has its id, public url, size, tags, alt text per language (en, th, zh, ru), how many places on the site use it, and whether its alt text is complete. Filter by text (matches file name, tags and alt text), by tag, by missing alt text, or by unused. Returns at most 50 per call; use offset for more.",
  access: "read",
  capability: "viewContent",
  input: {
    query: z.string().trim().max(100).optional(),
    tag: z.string().trim().max(40).optional(),
    missingAlt: z.boolean().optional().describe("Only items whose alt text is missing or too short in at least one language"),
    unused: z.boolean().optional().describe("Only items not used anywhere on the site"),
    limit: z.number().int().min(1).max(50).optional(),
    offset: z.number().int().min(0).max(100_000).optional(),
  },
  handler: async ({ query, tag, missingAlt, unused, limit = 20, offset = 0 }) => {
    const library = await getMediaLibrary();
    const needle = query?.toLowerCase();
    const matching = library.items.filter((item) => {
      if (tag && !item.tags.includes(tag)) return false;
      if (unused && item.usageCount > 0) return false;
      if (missingAlt && isAltTextComplete(item.altText, locales)) return false;
      if (needle) {
        const haystack = [fileName(item.url), ...item.tags, ...Object.values(item.altText)].join(" ").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    return {
      total: matching.length,
      offset,
      libraryTruncated: library.truncated,
      summary: { missingAlt: library.missingAltCount, unused: library.unusedCount, tags: library.tagCounts.slice(0, 40) },
      items: matching.slice(offset, offset + limit).map((item) => ({
        id: item.id,
        url: item.url,
        fileName: fileName(item.url),
        mimeType: item.mimeType,
        width: item.width,
        height: item.height,
        sizeBytes: item.sizeBytes,
        tags: item.tags,
        altText: item.altText,
        altComplete: isAltTextComplete(item.altText, locales),
        usageCount: item.usageCount,
        createdAt: item.createdAt,
      })),
    };
  },
});

defineTool({
  name: "media_usage",
  title: "Where an image is used",
  description: "Every place on the site that shows a given media item (project gallery, article, page section…), with a label and back-office link for each. Use before proposing to delete or replace an image.",
  access: "read",
  capability: "viewContent",
  input: { id: z.string().min(1).max(64) },
  handler: async ({ id }) => {
    const media = await prisma.media.findUnique({ where: { id }, select: { url: true } });
    if (!media) throw new Error("NOT_FOUND");
    return { id, url: media.url, usedIn: await findMediaUsage(media.url) };
  },
});

defineTool({
  name: "media_upload",
  title: "Upload an image from a URL",
  description:
    "Adds an image to the media library by downloading it from a public https URL. Returns immediately with a jobId — the download, storage and (if enabled) AI alt text happen in the background; poll job_status until DONE to get the new media id and url. Accepts JPEG, PNG, WebP and AVIF up to 15 MB. The URL must be publicly reachable; private or local addresses are refused. Optionally set tags and alt text now.",
  access: "write",
  capability: "editContent",
  input: {
    url: z.string().url().max(2000).describe("Public https URL of the image file"),
    tags: tagsInput.optional(),
    altText: altInput.optional().describe("Alt text per language; languages left out are drafted by AI when that is switched on"),
  },
  handler: async ({ url, tags, altText }, actor) => {
    // Refuse the obviously wrong ones now; the job vets the address again
    // after resolving it, at the moment it connects.
    try {
      parsePublicHttpsUrl(url);
    } catch (error) {
      throw new Error(error instanceof UnsafeUrlError ? error.message : "URL_INVALID");
    }
    const queued = await enqueueJob({
      kind: MEDIA_IMPORT_JOB,
      payload: { url, tags: tags ?? [], altText: altText ?? {} },
      createdById: actor.userId,
      tokenId: actor.tokenId,
    });
    if ("error" in queued) throw new Error(queued.error);
    return { status: "accepted", jobId: queued.id, next: "Call job_status with this jobId; the image is in the library once the status is DONE." };
  },
});

defineTool({
  name: "media_update",
  title: "Edit alt text and tags",
  description:
    "Sets the alt text (per language) and/or tags of one media item. Only the languages you send are changed; the others keep their text. Sending tags replaces the whole tag list. Alt text should describe what the image shows in one sentence, in that language.",
  access: "write",
  capability: "editContent",
  input: { id: z.string().min(1).max(64), altText: altInput.optional(), tags: tagsInput.optional() },
  handler: async ({ id, altText, tags }) => {
    if (!altText && !tags) throw new Error("NOTHING_TO_CHANGE");
    const current = await prisma.media.findUnique({ where: { id }, select: { altText: true, tags: true } });
    if (!current) throw new Error("NOT_FOUND");
    const merged = { ...((current.altText ?? {}) as Record<string, string>), ...Object.fromEntries(Object.entries(altText ?? {}).filter(([, v]) => v !== undefined)) };
    // The same action the library's own panel saves through.
    const result = await updateMediaMeta("th", { id, altText: merged, tags: tags ?? current.tags });
    if (!result.ok) throw new Error(result.error);
    return { status: "saved", id, altText: merged, tags: tags ?? current.tags };
  },
});

const MEDIA_DELETION = "media";

registerDeletion(MEDIA_DELETION, {
  tier: "chat",
  run: async (ids) => {
    const rows = await prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true, url: true } });
    let deleted = 0;
    for (const row of rows) {
      // Again, now: it may have been put to use since the request was made.
      if (await isMediaUrlInUse(row.url)) continue;
      const key = objectKeyFromUrl(row.url);
      if (key) await deleteS3Object(key).catch((error) => console.error("[mcp media] could not delete object", key, error));
      await prisma.media.delete({ where: { id: row.id } });
      deleted++;
    }
    return deleted;
  },
});

async function askToDelete(rows: { id: string; url: string }[]) {
  const names = rows.slice(0, 15).map((row) => `• ${fileName(row.url)}`);
  const more = rows.length > 15 ? `\n…and ${rows.length - 15} more` : "";
  return requestDeletion({
    kind: MEDIA_DELETION,
    ids: rows.map((row) => row.id),
    summary: `Permanently delete ${rows.length} unused image(s) from the media library and from storage:\n${names.join("\n")}${more}`,
  });
}

defineTool({
  name: "media_delete",
  title: "Ask to delete media",
  description:
    "Asks to permanently delete media items. NOTHING is deleted by this call: it returns a deletion request with a summary and a confirmationCode. Show the summary to the user, and only after they explicitly agree call confirm_deletion. Items still used anywhere on the site are refused — see media_usage.",
  access: "write",
  capability: "editContent",
  destructive: true,
  input: { ids: z.array(z.string().min(1).max(64)).min(1).max(100) },
  handler: async ({ ids }) => {
    const rows = await prisma.media.findMany({ where: { id: { in: ids } }, select: { id: true, url: true } });
    if (rows.length !== new Set(ids).size) throw new Error("NOT_FOUND:one or more ids do not exist");
    const usage = await findMediaUsageForUrls(rows.map((row) => row.url));
    const inUse = rows.filter((row) => (usage.get(row.url) ?? []).length > 0);
    if (inUse.length) throw new Error(`IN_USE:${inUse.map((row) => `${row.id} (${fileName(row.url)})`).join(", ")}`);
    return askToDelete(rows);
  },
});

defineTool({
  name: "media_delete_unused",
  title: "Ask to delete all unused images",
  description:
    "Asks to permanently delete every image that is not used anywhere on the site (at most 200 per request). NOTHING is deleted by this call: it returns a deletion request to confirm with the user first, exactly like media_delete.",
  access: "write",
  capability: "editContent",
  destructive: true,
  input: {},
  handler: async () => {
    const rows = await prisma.media.findMany({
      where: { OR: [{ mimeType: { startsWith: "image/" } }, { mimeType: null }] },
      orderBy: { createdAt: "asc" },
      select: { id: true, url: true },
    });
    const usage = await findMediaUsageForUrls(rows.map((row) => row.url));
    const unused = rows.filter((row) => (usage.get(row.url) ?? []).length === 0).slice(0, 200);
    if (unused.length === 0) throw new Error("NOTHING_TO_DELETE");
    return askToDelete(unused);
  },
});
