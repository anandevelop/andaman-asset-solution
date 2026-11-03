/**
 * lib/media-ai-alt.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The database half of AI alt text (lib/ai-alt.ts is the model half):
 * which images still need it, filling one, and the "AI alt ตอนอัปโหลด"
 * switch. Shared by the media actions and createMedia's after-upload hook.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { ALT_LOCALES, draftAltText, isAiAltConfigured } from "@/lib/ai-alt";
import { isAltTextComplete, MIN_ALT_LENGTH } from "@/lib/media-alt";
import { findMediaUsageForUrls } from "@/lib/media-usage";

const ON_UPLOAD_KEY = "media.aiAltOnUpload";

export type AltRow = { id: string; url: string; tags: string[]; altText: unknown };

/** Images (or rows with no recorded type) whose alt is incomplete in any language. */
export async function imagesMissingAlt(exclude: readonly string[] = []): Promise<AltRow[]> {
  const rows = await prisma.media.findMany({
    where: {
      OR: [{ mimeType: { startsWith: "image/" } }, { mimeType: null }],
      ...(exclude.length ? { id: { notIn: [...exclude] } } : {}),
    },
    select: { id: true, url: true, tags: true, altText: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.filter((row) => !isAltTextComplete(row.altText as Record<string, string> | null, ALT_LOCALES));
}

/** Only the languages that are empty or too short get the draft. */
export function mergeAlt(current: Record<string, string>, draft: Record<string, string>): Record<string, string> {
  const merged = { ...current };
  for (const lang of ALT_LOCALES) {
    if ((current[lang] ?? "").trim().length < MIN_ALT_LENGTH) merged[lang] = draft[lang];
  }
  return merged;
}

/** Drafts and saves one image's missing languages; returns what was saved. */
export async function fillAlt(row: AltRow, usedOn?: string[]): Promise<Record<string, string>> {
  const context = usedOn ?? ((await findMediaUsageForUrls([row.url])).get(row.url) ?? []).map((ref) => ref.label);
  const draft = await draftAltText(row.url, { tags: row.tags, usedOn: context.filter(Boolean) });
  const merged = mergeAlt((row.altText ?? {}) as Record<string, string>, draft);
  await prisma.media.update({ where: { id: row.id }, data: { altText: merged } });
  return merged;
}

export async function getAiAltOnUpload(): Promise<boolean> {
  try {
    const row = await prisma.siteSetting.findUnique({ where: { key: ON_UPLOAD_KEY }, select: { value: true } });
    return row?.value === "true";
  } catch {
    return false;
  }
}

export async function setAiAltOnUpload(on: boolean, actorId?: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: ON_UPLOAD_KEY },
    create: { key: ON_UPLOAD_KEY, value: on ? "true" : "false", updatedBy: actorId ?? null },
    update: { value: on ? "true" : "false", updatedBy: actorId ?? null },
  });
}

/** createMedia's hook: write alt for a fresh upload when the switch is on. */
export async function altAfterUpload(mediaId: string): Promise<void> {
  if (!(await isAiAltConfigured()) || !(await getAiAltOnUpload())) return;
  const row = await prisma.media.findUnique({
    where: { id: mediaId },
    select: { id: true, url: true, tags: true, altText: true, mimeType: true },
  });
  if (!row || (row.mimeType && !row.mimeType.startsWith("image/"))) return;
  try {
    await fillAlt(row);
  } catch (error) {
    console.error("[ai-alt] after upload", mediaId, error);
  }
}
