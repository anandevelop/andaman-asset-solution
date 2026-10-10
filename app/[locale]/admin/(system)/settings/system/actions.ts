"use server";

/**
 * app/[locale]/admin/(system)/settings/system/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Manually purges the public site's cached pages, across every locale —
 * the same whole-site purge (lib/revalidate-site.ts) the content-editing
 * actions call on save, just triggered by hand instead of by an edit.
 *
 * A safety net for whatever a normal save can't reach on its own: a bulk
 * script that writes through Prisma directly and skips every action's own
 * revalidatePath call, or a reverse proxy/CDN sitting in front of the app
 * that Next has no way to know about and that this cannot purge either —
 * only the app's own cache.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePublicSite } from "@/lib/revalidate-site";
import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";

export type ClearCacheResult = { ok: true } | { ok: false; error: string };

export async function clearSiteCache(): Promise<ClearCacheResult> {
  await requireAdminAction(Role.ADMIN);

  try {
    // See lib/revalidate-site.ts: a per-locale "layout" purge reached nothing.
    revalidatePublicSite();
  } catch (error) {
    console.error("[clearSiteCache] failed", error);
    return { ok: false, error: "CLEAR_FAILED" };
  }

  return { ok: true };
}
