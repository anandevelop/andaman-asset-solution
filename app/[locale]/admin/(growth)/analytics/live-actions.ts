"use server";

/**
 * app/[locale]/admin/(growth)/analytics/live-actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What the realtime tab polls, every twenty seconds.
 *
 * A server action rather than a route handler because it is read by one
 * client component in this zone and returns typed data — the same reasoning
 * every other admin screen here already follows.
 *
 * It calls the guard itself. The (growth) layout already requires ADMIN,
 * but a layout is a routing concern: a server action can be invoked
 * directly, by anybody who knows its id, without any layout having
 * rendered. AGENTS.md is explicit about this and it is the whole difference
 * between "the menu does not show it" and "you cannot have it".
 *
 * The window this reads is fifteen minutes, swept on write — see
 * lib/analytics/live-visit.ts. Nothing accumulates, so polling it is cheap
 * and there is no history here to page through.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { safeQuery } from "@/lib/db";
import {
  EMPTY_SNAPSHOT,
  getLiveSnapshot,
  toDto,
  type LiveSnapshotDto,
} from "@/lib/analytics/live-visit";

export async function fetchLiveSnapshot(): Promise<LiveSnapshotDto> {
  await requireAdminAction(Role.ADMIN);

  // A dashboard panel must not take the page down because Postgres
  // blinked; an empty realtime panel reads as "nobody is here", which is
  // the same thing it shows on a quiet afternoon.
  const snapshot = await safeQuery("fetchLiveSnapshot", getLiveSnapshot, EMPTY_SNAPSHOT);

  return toDto(snapshot);
}
