"use server";

/**
 * app/[locale]/admin/(system)/settings/system/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Manually purges the public site's cached pages, across every locale —
 * the same revalidatePath(path, "layout") every content-editing action
 * already calls on save, just triggered by hand instead of by an edit.
 *
 * A safety net for whatever a normal save can't reach on its own: a bulk
 * script that writes through Prisma directly and skips every action's own
 * revalidatePath call, or a reverse proxy/CDN sitting in front of the app
 * that Next has no way to know about and that this cannot purge either —
 * only the app's own cache.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { locales } from "@/i18n";

export type ClearCacheResult = { ok: true } | { ok: false; error: string };

export async function clearSiteCache(): Promise<ClearCacheResult> {
  await requireAdminAction(Role.ADMIN);

  try {
    for (const locale of locales) {
      revalidatePath(`/${locale}`, "layout");
    }
  } catch (error) {
    console.error("[clearSiteCache] failed", error);
    return { ok: false, error: "CLEAR_FAILED" };
  }

  return { ok: true };
}
