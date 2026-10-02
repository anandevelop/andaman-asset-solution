/**
 * lib/admin/dashboard-model.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The dashboard's arithmetic, apart from its queries.
 *
 * Everything here is a pure function over rows the loader already fetched
 * (lib/admin/dashboard.ts), so the rules that decide what a person is told
 * to do today — which items are in the inbox, in what order, how a
 * sparkline's missing days are drawn — are testable without a database.
 * Imports nothing but types, so a client component may use the shapes.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the day `at` falls in. PathHitDay stores UTC dates, and
 *  lib/appointments.ts draws "today" the same way, so every series and
 *  count on the dashboard shares one idea of where a day starts. */
export function utcDayStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * `days` values ending today, oldest first, with a zero for every day that
 * has no row.
 *
 * The zeros matter: a sparkline drawn from only the days that had traffic
 * joins Monday straight to Thursday and hides the two dead days between —
 * a quiet spell drawn as a smooth line is the one shape it must not lie
 * about.
 */
export function dailySeries(
  rows: readonly { day: Date; count: number }[],
  days: number,
  now: Date,
): number[] {
  const end = utcDayStart(now).getTime();
  const start = end - (days - 1) * DAY_MS;
  const series = new Array<number>(days).fill(0);

  for (const row of rows) {
    const index = Math.round((utcDayStart(row.day).getTime() - start) / DAY_MS);
    if (index >= 0 && index < days) series[index] += row.count;
  }

  return series;
}

/** Positive = the keyword climbed (rank 8 → 5 is +3). null when there is no
 *  earlier check to compare against, which is not the same as "no change". */
export function rankDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return previous - current;
}

/* ── The work inbox ─────────────────────────────────────────────────── */

export type InboxKind = "lead" | "appointment" | "content";

/**
 * One thing somebody should do today. Serialisable — it crosses into the
 * client inbox as a prop — so times are ISO strings and every label is
 * already translated by the server.
 */
export type InboxItem = {
  /** Unique across kinds: the inbox keys and filters by it. */
  key: string;
  kind: InboxKind;
  /** The record the action applies to. */
  id: string;
  title: string;
  detail: string | null;
  /** What the age is measured from: when the lead arrived, or when the
   *  appointment was due. null for a content gap, which has no moment it
   *  started — the translation report carries no dates. */
  since: string | null;
  /** "3 h", "2 d" — formatted server-side so hydration cannot disagree. */
  ageLabel: string | null;
  /** Past the point where waiting longer is a problem (the lead SLA, or
   *  any appointment already due). Drawn red. */
  late: boolean;
  /** Where the row goes when it is clicked rather than acted on. null
   *  when this role cannot open the destination. */
  href: string | null;
};

/**
 * Who has waited longest, in tiers: leads already past the response SLA,
 * then the other unassigned leads, then appointments nobody closed, then
 * content. Oldest first inside a tier.
 *
 * Tiers rather than one oldest-first list: a three-week-old appointment
 * that is only a status nobody set would otherwise sit above a lead that
 * arrived this morning and has a person waiting on a call. Content goes
 * last — a missing Thai FAQ answer has waited for nobody.
 */
function inboxTier(item: InboxItem): number {
  if (item.kind === "lead") return item.late ? 0 : 1;
  return item.kind === "appointment" ? 2 : 3;
}

export function sortInbox(items: readonly InboxItem[]): InboxItem[] {
  return [...items].sort((a, b) => {
    const tier = inboxTier(a) - inboxTier(b);
    if (tier !== 0) return tier;
    if (a.since === null || b.since === null) {
      if (a.since !== b.since) return a.since === null ? 1 : -1;
      // Undated rows (content groups) keep the order they came in —
      // groupContentGaps already put the largest first. Sort is stable.
      return 0;
    }
    if (a.since !== b.since) return a.since.localeCompare(b.since);
    return a.key.localeCompare(b.key);
  });
}

/** How many rows the inbox shows before "see all" (the v4 mockup's six). */
export const INBOX_VISIBLE = 6;

/**
 * Content gaps, one row per content type rather than per record.
 *
 * Per record, fifteen house types without Thai filled the inbox and pushed
 * the one waiting customer below the fold — the inbox is for what to do
 * next, and "translate the house types" is one job however many rows it
 * covers. Largest first; the translation report has the per-record list.
 */
export function groupContentGaps<S extends string, G extends string>(
  gaps: readonly { section: S; group: G; label: string }[],
): { section: S; group: G; count: number; sample: string[] }[] {
  const bySection = new Map<S, { section: S; group: G; count: number; sample: string[] }>();
  for (const gap of gaps) {
    const entry = bySection.get(gap.section) ?? { section: gap.section, group: gap.group, count: 0, sample: [] };
    entry.count += 1;
    if (entry.sample.length < 2) entry.sample.push(gap.label);
    bySection.set(gap.section, entry);
  }
  return [...bySection.values()].sort((a, b) => b.count - a.count || a.section.localeCompare(b.section));
}

export function inboxCounts(items: readonly InboxItem[]): Record<InboxKind | "all", number> {
  const counts = { all: items.length, lead: 0, appointment: 0, content: 0 };
  for (const item of items) counts[item.kind] += 1;
  return counts;
}

/** Whole hours or days, whichever is the natural unit — nobody reads
 *  "74 h" as fast as "3 d". */
export function ageParts(since: Date, now: Date): { unit: "minute" | "hour" | "day"; value: number } {
  const minutes = Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000));
  if (minutes < 60) return { unit: "minute", value: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return { unit: "hour", value: hours };
  return { unit: "day", value: Math.floor(hours / 24) };
}

/* ── The funnel ─────────────────────────────────────────────────────── */

/**
 * The pipeline in stage order, LOST left out: it is where leads leave the
 * funnel, not a step in it, and a bar for it beside WON would read as a
 * stage somebody is meant to reach.
 *
 * QUALIFIED is kept although the v4 mockup skips it — leads really do sit
 * there, and a funnel that drops a stage hides every lead in it.
 */
export const FUNNEL_STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "VIEWING_SCHEDULED",
  "NEGOTIATING",
  "WON",
] as const;

export type FunnelStage = (typeof FUNNEL_STAGES)[number];
