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
import { isTestNotification } from "@/lib/admin/notification-feed";

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

/**
 * "ล้างข้อมูลทดสอบ" — mark this user's unread test notifications read, so
 * the drawer's folded "test records" line stops counting them.
 *
 * Read, not deleted: the v4 brief's rule for test rows is "add a filter,
 * not a delete", and these point at real (if test) records. Which rows
 * count as test is decided here, on the server, with the same predicate the
 * drawer folds by (lib/admin/notification-feed.ts) — no ids come from the
 * browser. ADMIN and above, as the brief asks: it is a housekeeping action
 * on what QA left behind, not something every reader needs.
 */
export async function dismissTestNotifications(locale: string): Promise<{ ok: boolean; count: number }> {
  const session = await requireAdminAction(Role.ADMIN);

  try {
    const unread = await prisma.adminNotification.findMany({
      where: { userId: session.id, readAt: null },
      select: { id: true, title: true, body: true },
    });
    const ids = unread.filter(isTestNotification).map((row) => row.id);
    if (ids.length > 0) {
      await withoutAudit(() =>
        prisma.adminNotification.updateMany({
          where: { id: { in: ids }, userId: session.id },
          data: { readAt: new Date() },
        }),
      );
    }
    revalidatePath(`/${locale}/admin`, "layout");
    return { ok: true, count: ids.length };
  } catch (error) {
    console.error("[dismissTestNotifications]", error);
    return { ok: false, count: 0 };
  }
}
