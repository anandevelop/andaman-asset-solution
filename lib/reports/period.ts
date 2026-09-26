/**
 * lib/reports/period.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What "last month" and "Q3" mean, in UTC, as a pair of instants.
 *
 * Kept apart from every query so the boundaries can be tested directly.
 * A report that quietly runs from the 2nd to the 1st, or that includes
 * three hours of the following month because somebody used local midnight
 * on a server in Bangkok, is wrong in a way no reader can see: the numbers
 * look plausible and simply do not match the month on the cover.
 *
 * UTC throughout, matching the @db.Date columns the rollups and notes use.
 * The alternative — Asia/Bangkok, the office's own clock — would put a
 * measurement in a different month depending on where the container runs,
 * which is the sort of thing nobody finds for a year.
 *
 * The period is half-open, [start, end): the last millisecond of the month
 * belongs to the month, and the first of the next one does not. Every
 * query built on this uses `gte: start, lt: end` for the same reason.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type PeriodKind = "lastMonth" | "thisMonth" | "lastQuarter" | "custom";

export type Period = {
  kind: PeriodKind;
  /** Inclusive. */
  start: Date;
  /** Exclusive — see the header. */
  end: Date;
  /** First day of the covering month, UTC: the key ReportNote is filed by. */
  noteKey: Date;
};

function utcMonthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

/** The month containing `now`, as [first, next first). */
export function thisMonth(now: Date = new Date()): Period {
  const start = utcMonthStart(now.getUTCFullYear(), now.getUTCMonth());
  const end = utcMonthStart(now.getUTCFullYear(), now.getUTCMonth() + 1);
  return { kind: "thisMonth", start, end, noteKey: start };
}

/**
 * The month before the one containing `now`.
 *
 * The default for a report, and the only period a monthly send should ever
 * use: a report mailed on the 1st is about the month that just finished,
 * not about the few hours of the new one.
 */
export function lastMonth(now: Date = new Date()): Period {
  const start = utcMonthStart(now.getUTCFullYear(), now.getUTCMonth() - 1);
  const end = utcMonthStart(now.getUTCFullYear(), now.getUTCMonth());
  return { kind: "lastMonth", start, end, noteKey: start };
}

/**
 * The calendar quarter before the one containing `now`.
 *
 * Filed under its first month, so "Q3" and "July" share a note rather than
 * silently keeping two. A team that writes the quarter's actions has
 * written July's.
 */
export function lastQuarter(now: Date = new Date()): Period {
  const currentQuarter = Math.floor(now.getUTCMonth() / 3);
  const startMonth = (currentQuarter - 1) * 3;

  const start = utcMonthStart(now.getUTCFullYear(), startMonth);
  const end = utcMonthStart(now.getUTCFullYear(), startMonth + 3);

  return { kind: "lastQuarter", start, end, noteKey: start };
}

/**
 * An explicit range, from two yyyy-mm-dd strings.
 *
 * Returns null rather than throwing, and rather than silently correcting:
 * a reversed or unparseable range is a broken query string, and a report
 * that quietly shows a different period than the one asked for is worse
 * than one that says it cannot.
 *
 * `end` is given as an inclusive day by the caller — a person picking "31
 * August" means the whole of the 31st — and made exclusive here, which is
 * exactly the off-by-one this function exists to own.
 */
export function customPeriod(from: string, to: string): Period | null {
  const start = parseUtcDay(from);
  const inclusiveEnd = parseUtcDay(to);
  if (!start || !inclusiveEnd) return null;

  const end = new Date(inclusiveEnd);
  end.setUTCDate(end.getUTCDate() + 1);

  if (end <= start) return null;

  return {
    kind: "custom",
    start,
    end,
    noteKey: utcMonthStart(start.getUTCFullYear(), start.getUTCMonth()),
  };
}

function parseUtcDay(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Rejects 2026-02-31, which Date would roll forward to 3 March without
  // complaint — and which would then report a month the reader did not ask
  // for.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

/** The period a `?period=` value names, falling back to last month. */
export function resolvePeriod(
  params: { period?: string; from?: string; to?: string },
  now: Date = new Date(),
): Period {
  if (params.period === "thisMonth") return thisMonth(now);
  if (params.period === "lastQuarter") return lastQuarter(now);

  if (params.period === "custom" && params.from && params.to) {
    return customPeriod(params.from, params.to) ?? lastMonth(now);
  }

  return lastMonth(now);
}

/**
 * The last day the period actually covers, for "data up to …".
 *
 * `end` is exclusive, so printing it names a day outside the report — the
 * 1st of September on an August report, which reads as though August had
 * 32 days.
 */
export function lastCoveredDay(period: Period): Date {
  const day = new Date(period.end);
  day.setUTCDate(day.getUTCDate() - 1);
  return day;
}

/**
 * What every "▲ 12%" on the report is measured against.
 *
 * A calendar period compares against the calendar period before it, and
 * only a custom range falls back to "the same number of days, immediately
 * before".
 *
 * The difference is not pedantry. Subtracting a fixed span from a month
 * lands on the previous month only when the two happen to be the same
 * length: 31 days before 1 March is 29 January, so an March report would
 * have been comparing against the last three days of January plus most of
 * February and calling it "February". Comparing March's 31 days against
 * February's 28 is itself imperfect — February is genuinely a shorter month
 * — but it is the comparison every reader believes they are being shown,
 * and it is the one Search Console and GA4 draw too.
 *
 * A custom range has no calendar predecessor, so equal length is the only
 * honest answer there: eleven days against a whole month reads as a 60%
 * collapse that never happened.
 */
export function precedingPeriod(period: Period): { start: Date; end: Date } {
  if (period.kind === "thisMonth" || period.kind === "lastMonth") {
    const start = utcMonthStart(
      period.start.getUTCFullYear(),
      period.start.getUTCMonth() - 1,
    );
    return { start, end: period.start };
  }

  if (period.kind === "lastQuarter") {
    const start = utcMonthStart(
      period.start.getUTCFullYear(),
      period.start.getUTCMonth() - 3,
    );
    return { start, end: period.start };
  }

  const span = period.end.getTime() - period.start.getTime();
  return { start: new Date(period.start.getTime() - span), end: period.start };
}
