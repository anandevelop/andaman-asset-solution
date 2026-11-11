/**
 * lib/analytics/traffic-store.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Writing the two traffic-source counters. Both endpoints that call this
 * are public, so — like bumpPathHit — a new row is only added while today
 * is under a cap: somebody posting invented paths or sources can fill one
 * day's allowance, not the database.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { hitDay } from "@/lib/redirects";
import { classifyVisit, type VisitOrigin } from "@/lib/analytics/traffic-source";
import type { ClickAction } from "@/lib/analytics/click-actions";

export const MAX_NEW_TRAFFIC_ROWS_PER_DAY = 3000;

/** Count the start of one visit, against the page it landed on. */
export async function recordVisit(origin: VisitOrigin, landingPath: string): Promise<void> {
  const { channel, source } = classifyVisit(origin);
  const day = hitDay();

  const existing = await prisma.trafficVisitDay.updateMany({
    where: { day, source, landingPath },
    data: { visits: { increment: 1 } },
  });
  if (existing.count > 0) return;
  if ((await prisma.trafficVisitDay.count({ where: { day } })) >= MAX_NEW_TRAFFIC_ROWS_PER_DAY) return;

  await prisma.trafficVisitDay.upsert({
    where: { day_source_landingPath: { day, source, landingPath } },
    create: { day, channel, source, landingPath, visits: 1 },
    update: { visits: { increment: 1 } },
  });
}

/** Count one contact click on `path`, against the visit's source. */
export async function recordClick(action: ClickAction, path: string, origin: VisitOrigin): Promise<void> {
  const { channel, source } = classifyVisit(origin);
  const day = hitDay();

  const existing = await prisma.contactClickDay.updateMany({
    where: { day, action, path, source },
    data: { clicks: { increment: 1 } },
  });
  if (existing.count > 0) return;
  if ((await prisma.contactClickDay.count({ where: { day } })) >= MAX_NEW_TRAFFIC_ROWS_PER_DAY) return;

  await prisma.contactClickDay.upsert({
    where: { day_action_path_source: { day, action, path, source } },
    create: { day, action, path, channel, source, clicks: 1 },
    update: { clicks: { increment: 1 } },
  });
}
