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
import type { CopyProblem } from "@/lib/site-copy-core";
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
