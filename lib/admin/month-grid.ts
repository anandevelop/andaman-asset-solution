/**
 * lib/admin/month-grid.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The appointments month view's grid: whole weeks, Monday first, from the
 * week the 1st falls in to the week the last day falls in.
 *
 * UTC throughout, like lib/appointments.ts's week view and its dayKey():
 * a calendar that bucketed by one clock and a week grid by another would
 * put a 23:30 viewing on different days in the two views of one page.
 * ─────────────────────────────────────────────────────────────────────────
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** `?month=YYYY-MM` → the 1st of that month, UTC; this month when absent
 *  or unparsable. */
export function parseMonthParam(value: string | undefined, now = new Date()): Date {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) return new Date(Date.UTC(Number(match[1]), month - 1, 1));
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function toMonthParam(monthStart: Date): string {
  return monthStart.toISOString().slice(0, 7);
}

export function addMonths(monthStart: Date, delta: number): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + delta, 1));
}

/**
 * "2026-09-30" — the Bangkok calendar day a moment falls on, the key
 * appointments are bucketed under. A grid cell's own date is UTC midnight,
 * which is 07:00 the same day in Bangkok, so it keys the same. Until
 * November 2026 this was the UTC date, and a 06:30 viewing landed in the
 * day before's cell.
 */
export const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Today in Bangkok as a [start, end) pair of UTC instants. Every "today"
 * list in the back office (the rep's day, the dashboard, the mobile app)
 * takes its window from here, so none of them rolls over at 07:00.
 */
export function bangkokToday(now = new Date()): { start: Date; end: Date } {
  const local = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  const start = new Date(local.getTime() - BANGKOK_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function dayKey(date: Date): string {
  return new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Every day on screen, in rows of seven. Days outside the month are
 * included (the grid is whole weeks) and flagged, so they can be drawn
 * dimmed rather than left as holes.
 */
export function monthGrid(monthStart: Date): { date: Date; inMonth: boolean }[][] {
  const first = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));

  const mondayOffset = (first.getUTCDay() + 6) % 7; // Monday = 0
  const start = new Date(first.getTime() - mondayOffset * DAY_MS);
  const sundayOffset = (7 - ((last.getUTCDay() + 6) % 7) - 1) % 7;
  const end = new Date(last.getTime() + sundayOffset * DAY_MS);

  const weeks: { date: Date; inMonth: boolean }[][] = [];
  for (let day = start.getTime(); day <= end.getTime(); day += 7 * DAY_MS) {
    weeks.push(
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date(day + index * DAY_MS);
        return { date, inMonth: date.getUTCMonth() === first.getUTCMonth() };
      }),
    );
  }
  return weeks;
}
