/**
 * lib/system-errors.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The site's own error log, and the LINE message that says something broke.
 *
 * WHY THIS AND NOT AN ERROR TRACKER
 *
 * The team reads LINE all day and already gets its leads there; an error
 * tracker is one more account nobody opens. So a failure is written to
 * system_errors (one row per distinct failure, with a count) and the team
 * is told on LINE — and in the bell — the first time it is seen, then again
 * only after six quiet hours, at most five messages an hour in total. The
 * list is on /admin/settings/system.
 *
 * WHAT ARRIVES HERE
 *
 *  - anything a page, route handler or server action throws
 *    (instrumentation.ts → onRequestError),
 *  - an error boundary shown in a visitor's browser (POST /api/client-error).
 *
 * WHEN THE DATABASE IS THE THING THAT BROKE
 *
 * Then the row cannot be written — and that is the alert most worth
 * sending. The throttle falls back to memory, the LINE push is attempted
 * anyway, and it works whenever LINE's own settings are still in this
 * process's cache or environment.
 *
 * Never throws: reporting a failure must not become a second failure.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import { withoutAudit } from "@/lib/audit/context";
import { pushLineAlert } from "@/lib/line";
import { isEnabled, notifyAdmins } from "@/lib/notifications";
import {
  REALERT_AFTER_MS,
  factsOf,
  fingerprintOf,
  isIgnorable,
  placeOf,
  shouldAlert,
} from "@/lib/system-error-rules";

export type SystemErrorKind = "server" | "client";

const HOUR_MS = 60 * 60 * 1000;

/** Memory fallback for the throttle, used when the table cannot be read. */
const alertedInMemory = new Map<string, number>();

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://andamanassetsolution.com").replace(/\/+$/, "");
}

function memoryAllows(fingerprint: string, now: number): boolean {
  for (const [key, at] of alertedInMemory) if (now - at > REALERT_AFTER_MS) alertedInMemory.delete(key);
  const recent = [...alertedInMemory.values()].filter((at) => now - at < HOUR_MS).length;
  return shouldAlert({
    lastAlertAt: alertedInMemory.has(fingerprint) ? new Date(alertedInMemory.get(fingerprint)!) : null,
    alertsThisHour: recent,
    now: new Date(now),
  });
}

/**
 * Record one failure and, if it is news, tell the team.
 * `path` is where it happened — a route pattern or a URL path.
 */
export async function recordSystemError(error: unknown, context: { kind: SystemErrorKind; path?: string | null }): Promise<void> {
  try {
    const facts = factsOf(error);
    if (isIgnorable(facts)) return;

    const place = placeOf(context.path);
    const fingerprint = fingerprintOf(context.kind, facts, place);
    const now = new Date();

    let count = 1;
    let alert: boolean;
    try {
      const row = await withoutAudit(() =>
        prisma.systemError.upsert({
          where: { fingerprint },
          create: { fingerprint, kind: context.kind, name: facts.name.slice(0, 120), message: facts.message, place },
          update: { count: { increment: 1 }, lastSeenAt: now, message: facts.message },
          select: { count: true, lastAlertAt: true },
        }),
      );
      count = row.count;
      const alertsThisHour = await prisma.systemError.count({ where: { lastAlertAt: { gte: new Date(now.getTime() - HOUR_MS) } } });
      alert = shouldAlert({ lastAlertAt: row.lastAlertAt, alertsThisHour, now });
      if (alert) await withoutAudit(() => prisma.systemError.update({ where: { fingerprint }, data: { lastAlertAt: now } }));
    } catch {
      // The database is unreachable — possibly the very failure reported.
      alert = memoryAllows(fingerprint, now.getTime());
    }
    if (!alert) return;
    alertedInMemory.set(fingerprint, now.getTime());

    const title = context.kind === "client" ? "หน้าเว็บแสดงข้อผิดพลาดให้ผู้ใช้" : "ระบบเกิดข้อผิดพลาด";
    const rows: [string, string][] = [
      ["ข้อความ", `${facts.name}: ${facts.message}`.slice(0, 280)],
      ["ที่เกิด", place],
      ["จำนวนครั้ง", String(count)],
    ];
    const path = "/admin/settings/system";

    const [line, inApp] = await Promise.all([
      isEnabled("systemError", "line").catch(() => true),
      isEnabled("systemError", "inApp").catch(() => false),
    ]);
    if (line) await pushLineAlert({ kind: "error", title: `⚠️ ${title}`, rows, url: `${siteUrl()}/th${path}`, urlLabel: "ดูรายการข้อผิดพลาด" });
    if (inApp) await notifyAdmins({ event: "systemError", title, body: `${rows[0][1]} · ${place}`, href: path }).catch(() => 0);
  } catch (failure) {
    console.error("[system-errors] could not record", failure);
  }
}

export type SystemErrorRow = {
  id: string;
  kind: string;
  name: string;
  message: string;
  place: string;
  count: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

/** The most recent failures, for /admin/settings/system. */
export function recentSystemErrors(limit = 20): Promise<SystemErrorRow[]> {
  return prisma.systemError.findMany({
    orderBy: { lastSeenAt: "desc" },
    take: limit,
    select: { id: true, kind: true, name: true, message: true, place: true, count: true, firstSeenAt: true, lastSeenAt: true },
  });
}

export async function clearSystemErrors(): Promise<number> {
  return (await withoutAudit(() => prisma.systemError.deleteMany({}))).count;
}
