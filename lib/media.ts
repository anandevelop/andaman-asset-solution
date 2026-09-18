/**
 * lib/media.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read side of the media library — the list the admin page renders and the
 * small stats its filter chips and health banner need.
 *
 * Scope note: this reads every Media row (capped at MAX_LIBRARY_ROWS) and
 * lets the client component filter/search in memory. That is deliberately
 * simple rather than server-paginated: the library only contains what has
 * been uploaded *through* it since this feature shipped (see this file's
 * header in app/[locale]/admin/media/actions.ts — there is no relation
 * from the decades of existing Project/News/... image URLs back to a
 * Media row, so nothing is auto-imported), which keeps the realistic row
 * count small for a good while. Move to server-side pagination once a real
 * library approaches the cap, not before — it would trade away the instant
 * client-side search for no benefit until then.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";
import { locales } from "@/i18n";
import { countMediaUsage } from "@/lib/media-usage";

const MAX_LIBRARY_ROWS = 500;

/**
 * Hosts a file may still be served from after the move to DigitalOcean
 * Spaces. lib/s3.ts stores an absolute URL per upload rather than a bare
 * key, so the move rewrote nothing: anything uploaded before it still
 * carries its old address and becomes a broken image the day that bucket
 * is switched off.
 *
 * Kept in step with next.config.js's `legacyMediaHosts` (which keeps them
 * in remotePatterns so the images still render meanwhile) and with
 * scripts/media-legacy-check.ts, which finds the same rows across the
 * whole schema rather than just this table.
 */
export const LEGACY_MEDIA_HOSTS = ["supabase.co"];

export function isLegacyHostUrl(url: string): boolean {
  return LEGACY_MEDIA_HOSTS.some((host) => url.includes(host));
}

export type MediaAltText = Partial<Record<(typeof locales)[number], string>>;

export type MediaListItem = {
  id: string;
  url: string;
  key: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
  tags: string[];
  altText: MediaAltText;
  createdAt: Date;
  uploaderName: string | null;
  /** How many places across the site reference this file's URL. */
  usageCount: number;
  /** Still served from a decommissioned host — see LEGACY_MEDIA_HOSTS. */
  isLegacyHost: boolean;
};

export type MediaLibraryData = {
  items: MediaListItem[];
  tagCounts: { tag: string; count: number }[];
  missingAltCount: number;
  /** Files nothing on the site references — safe to delete, and the first
   *  thing to look at when the bucket bill goes up. */
  unusedCount: number;
  legacyHostCount: number;
  truncated: boolean;
};

function isAltTextComplete(altText: MediaAltText | null): boolean {
  if (!altText) return false;
  return locales.every((locale) => (altText[locale] ?? "").trim().length > 0);
}

export async function getMediaLibrary(): Promise<MediaLibraryData> {
  return safeQuery(
    "getMediaLibrary",
    async () => {
      const rows = await prisma.media.findMany({
        orderBy: { createdAt: "desc" },
        take: MAX_LIBRARY_ROWS + 1,
        select: {
          id: true,
          url: true,
          key: true,
          mimeType: true,
          width: true,
          height: true,
          sizeBytes: true,
          tags: true,
          altText: true,
          createdAt: true,
          uploader: { select: { name: true } },
        },
      });

      const truncated = rows.length > MAX_LIBRARY_ROWS;
      const page = truncated ? rows.slice(0, MAX_LIBRARY_ROWS) : rows;

      // One batched pass for the whole page rather than a lookup per tile
      // — see lib/media-usage.ts's header for the arithmetic.
      const usageByUrl = await countMediaUsage(page.map((row) => row.url));

      const tagTally = new Map<string, number>();
      let missingAltCount = 0;
      let unusedCount = 0;
      let legacyHostCount = 0;

      const items: MediaListItem[] = page.map((row) => {
        for (const tag of row.tags) {
          tagTally.set(tag, (tagTally.get(tag) ?? 0) + 1);
        }
        const altText = (row.altText ?? {}) as MediaAltText;
        if (!isAltTextComplete(altText)) missingAltCount += 1;

        const usageCount = usageByUrl.get(row.url) ?? 0;
        if (usageCount === 0) unusedCount += 1;

        const legacy = isLegacyHostUrl(row.url);
        if (legacy) legacyHostCount += 1;

        return {
          id: row.id,
          url: row.url,
          key: row.key,
          mimeType: row.mimeType,
          width: row.width,
          height: row.height,
          sizeBytes: row.sizeBytes,
          tags: row.tags,
          altText,
          createdAt: row.createdAt,
          uploaderName: row.uploader?.name ?? null,
          usageCount,
          isLegacyHost: legacy,
        };
      });

      const tagCounts = Array.from(tagTally.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

      return { items, tagCounts, missingAltCount, unusedCount, legacyHostCount, truncated };
    },
    {
      items: [],
      tagCounts: [],
      missingAltCount: 0,
      unusedCount: 0,
      legacyHostCount: 0,
      truncated: false,
    },
  );
}
