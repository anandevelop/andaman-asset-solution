"use server";

/**
 * app/[locale]/admin/settings/notifications/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Saving the notification matrix.
 *
 * The validation that matters happens in lib/notifications.ts's
 * saveNotificationPrefs, which drops unknown keys and refuses to store an
 * "on" for an event that needs a scheduler — the same rule the UI renders,
 * enforced where it cannot be bypassed by a hand-made request.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { saveNotificationPrefs, type NotificationPrefs } from "@/lib/notifications";

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function updateNotificationPrefs(
  locale: string,
  prefs: unknown,
): Promise<SaveResult> {
  await requireAdminAction(Role.ADMIN);

  if (typeof prefs !== "object" || prefs === null) return { ok: false, error: "INVALID_INPUT" };

  try {
    await saveNotificationPrefs(prefs as NotificationPrefs);
  } catch (error) {
    console.error("[updateNotificationPrefs]", error);
    return { ok: false, error: "SAVE_FAILED" };
  }

  revalidatePath(`/${locale}/admin/settings/notifications`);
  return { ok: true };
}
