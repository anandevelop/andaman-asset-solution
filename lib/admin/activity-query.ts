/**
 * lib/admin/activity-query.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The activity page's filters, as data: the six tabs, the time ranges, the
 * search box and the person — and the Prisma `where` they add up to.
 *
 * Shared by the page and by the CSV export so that "what I am looking at"
 * and "what I downloaded" cannot be two different sets.
 *
 * THE TABS ARE BY JOB, NOT BY TABLE
 *
 * AuditLog.model is a Prisma model name, and there are sixty of them. A
 * reader asks "what happened to customers", "who touched a price", "who
 * signed in" — so each entry falls into one of five groups, by the model
 * it is about. Prefixes rather than lists: `ProjectUnitType`,
 * `ProjectTranslation` and whatever is added next year all start with
 * `Project`. Content is "everything else", so a new model is never
 * missing from every tab.
 *
 * Pure: no database, no request.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Prisma } from "@prisma/client";

export const ACTIVITY_CATEGORIES = ["all", "crm", "catalog", "content", "team", "security"] as const;
export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];
export type ActivityGroup = Exclude<ActivityCategory, "all">;

/** Model-name prefixes per group. Order is the order they are tested in. */
const PREFIXES: Record<Exclude<ActivityGroup, "content">, readonly string[]> = {
  security: ["Session", "RecoveryCode"],
  crm: ["Lead", "SuspectLead", "Appointment", "EventRegistration", "Agent"],
  team: ["User", "SalesPerson"],
  catalog: ["Project", "UnitType", "FloorPlan", "EBrochure", "NearbyPlace", "NearbyCategory"],
};

const GROUP_ORDER = ["security", "crm", "team", "catalog"] as const;

export function categoryOf(model: string): ActivityGroup {
  for (const group of GROUP_ORDER) {
    if (PREFIXES[group].some((prefix) => model.startsWith(prefix))) return group;
  }
  return "content";
}

export const ACTIVITY_RANGES = ["today", "7", "30", "all"] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];
export const DEFAULT_RANGE: ActivityRange = "30";

export type ActivityFilters = {
  category: ActivityCategory;
  range: ActivityRange;
  actor?: string;
  q?: string;
};

const pick = <T extends string>(raw: string | null | undefined, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;

/** From the query string. Anything unrecognised is the default, never an error. */
export function parseActivityFilters(params: {
  tab?: string | null;
  range?: string | null;
  actor?: string | null;
  q?: string | null;
}): ActivityFilters {
  return {
    category: pick(params.tab, ACTIVITY_CATEGORIES, "all"),
    range: pick(params.range, ACTIVITY_RANGES, DEFAULT_RANGE),
    actor: params.actor?.trim().slice(0, 200) || undefined,
    q: params.q?.trim().slice(0, 100) || undefined,
  };
}

/** Midnight in Bangkok for "today" — the office's day, not the server's. */
export function rangeSince(range: ActivityRange, now = new Date()): Date | null {
  if (range === "all") return null;
  if (range === "today") {
    const bangkok = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    bangkok.setUTCHours(0, 0, 0, 0);
    return new Date(bangkok.getTime() - 7 * 60 * 60 * 1000);
  }
  return new Date(now.getTime() - Number(range) * 24 * 60 * 60 * 1000);
}

function groupWhere(group: ActivityGroup): Prisma.AuditLogWhereInput {
  if (group !== "content") {
    return { OR: PREFIXES[group].map((prefix) => ({ model: { startsWith: prefix } })) };
  }
  // Everything the other four do not claim.
  return {
    NOT: GROUP_ORDER.flatMap((other) => PREFIXES[other]).map((prefix) => ({ model: { startsWith: prefix } })),
  };
}

/**
 * Everything but the tab — what the tab counts are counted over, so the
 * number on a tab is what pressing it will show.
 */
export function baseWhere(filters: ActivityFilters, now = new Date()): Prisma.AuditLogWhereInput {
  const since = rangeSince(filters.range, now);
  return {
    ...(since ? { createdAt: { gte: since } } : {}),
    ...(filters.actor ? { actorEmail: filters.actor } : {}),
    ...(filters.q
      ? {
          OR: [
            { recordLabel: { contains: filters.q, mode: "insensitive" as const } },
            { actorEmail: { contains: filters.q, mode: "insensitive" as const } },
            { ipAddress: { contains: filters.q } },
            { changedFields: { has: filters.q } },
          ],
        }
      : {}),
  };
}

export function activityWhere(filters: ActivityFilters, now = new Date()): Prisma.AuditLogWhereInput {
  const base = baseWhere(filters, now);
  return filters.category === "all" ? base : { AND: [base, groupWhere(filters.category)] };
}

/** Tab counts from one `groupBy model` over baseWhere. */
export function countByCategory(rows: { model: string; count: number }[]): Record<ActivityCategory, number> {
  const totals: Record<ActivityCategory, number> = { all: 0, crm: 0, catalog: 0, content: 0, team: 0, security: 0 };
  for (const row of rows) {
    totals.all += row.count;
    totals[categoryOf(row.model)] += row.count;
  }
  return totals;
}

/** The fields whose edit counts as "a price or a status changed" on a unit. */
export const UNIT_COMMERCIAL_FIELDS = ["priceTHB", "status"] as const;

/** "2 ชม.ที่แล้ว" — coarse on purpose; the exact time sits under it. */
export function relativeTime(at: Date, now: Date, locale: string): string {
  const seconds = Math.round((at.getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(0, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour");
  return format.format(Math.round(seconds / 86_400), "day");
}
