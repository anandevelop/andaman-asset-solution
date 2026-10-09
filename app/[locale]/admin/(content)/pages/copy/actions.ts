"use server";

/**
 * app/[locale]/admin/(content)/pages/copy/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Saves the cells the editor changed in the four-language grid. The grid
 * posts only changed cells, named `copy:<locale>:<key>`; the rules (blank
 * or default deletes the row, placeholders must match the default) live
 * in lib/site-copy-save.ts, shared with the picker on the public site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { locales } from "@/i18n";
import { isEditableKey, type CopyProblem } from "@/lib/site-copy-core";
import { allCopyDefaults } from "@/lib/site-copy-content";
import { saveCopyEntries, type CopyEntry } from "@/lib/site-copy-save";

export type SiteCopyFormState = {
  ok: boolean;
  message?: "SAVED" | "SAVE_FAILED";
  /** Keyed `${locale}:${key}`, so the cell can show its own error. */
  fields?: Record<string, CopyProblem>;
  saved?: number;
};

/** Field names carry this prefix — message keys contain dots and may
 *  collide with anything else React adds to the FormData. */
const FIELD_PREFIX = "copy:";

export async function updateSiteCopy(
  _locale: string,
  _previous: SiteCopyFormState,
  formData: FormData,
): Promise<SiteCopyFormState> {
  const actor = await requireAdminAction(Role.EDITOR);

  const entries: CopyEntry[] = [];
  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith(FIELD_PREFIX) || typeof raw !== "string") continue;
    const rest = name.slice(FIELD_PREFIX.length);
    const split = rest.indexOf(":");
    if (split <= 0) continue;
    entries.push({ locale: rest.slice(0, split), key: rest.slice(split + 1), value: raw });
  }

  const result = await saveCopyEntries(actor.id, entries);
  if (result.failed) return { ok: false, message: "SAVE_FAILED" };
  if (!result.ok) return { ok: false, fields: result.errors };
  return { ok: true, message: "SAVED", saved: result.saved };
}

/**
 * "Checked — this translation is still right."
 *
 * A row is flagged for review when its Thai was edited after another
 * language last was. Often the other language needs no change at all (a
 * Thai typo fix, a wording tweak with the same meaning), and before this
 * there was no way to say so: saving identical text is a no-op, so the
 * flag stayed forever and the "review" count stopped meaning anything.
 *
 * Stamps every non-Thai language of the key. The grid compares the Thai
 * edit against the later of a language's own edit and this stamp, so a
 * subsequent Thai edit raises the flag again, as it should. Nothing on the
 * public site changes, so nothing is revalidated.
 */
export async function markCopyReviewed(key: string): Promise<{ ok: boolean }> {
  const actor = await requireAdminAction(Role.EDITOR);
  if (typeof key !== "string" || !isEditableKey(key)) return { ok: false };
  const defaults = await allCopyDefaults("th");
  if (defaults[key] === undefined) return { ok: false };

  const now = new Date();
  try {
    await prisma.$transaction(
      locales
        .filter((l) => l !== "th")
        .map((locale) =>
          prisma.siteCopyReview.upsert({
            where: { locale_key: { locale, key } },
            create: { locale, key, reviewedBy: actor.id, reviewedAt: now },
            update: { reviewedBy: actor.id, reviewedAt: now },
          }),
        ),
    );
  } catch (error) {
    console.error("[markCopyReviewed] failed", error);
    return { ok: false };
  }

  // The grid is a dynamic page; the caller refreshes it (router.refresh).
  return { ok: true };
}
