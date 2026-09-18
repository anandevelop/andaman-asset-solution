"use server";

/**
 * app/[locale]/admin/notifications-actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Marking the bell's feed read.
 *
 * Scoped to the signed-in user by construction: the id never comes from
 * the client, so one administrator cannot mark another's notifications
 * read, and there is nothing to authorise beyond being signed in at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { withoutAudit } from "@/lib/audit/context";

export async function markNotificationsRead(locale: string): Promise<{ ok: boolean }> {
  const session = await requireAdminAction(Role.VIEWER);

  try {
    // withoutAudit: reading one's own notifications is not an edit to the
    // site, and the audit trail is for changes to content and accounts.
    await withoutAudit(() =>
      prisma.adminNotification.updateMany({
        where: { userId: session.id, readAt: null },
        data: { readAt: new Date() },
      }),
    );
  } catch (error) {
    console.error("[markNotificationsRead]", error);
    return { ok: false };
  }

  revalidatePath(`/${locale}/admin`, "layout");
  return { ok: true };
}
