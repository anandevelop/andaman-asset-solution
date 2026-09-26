/**
 * tests/cron-schedule.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * When the scheduler decides each job runs next.
 *
 * A scheduler fails silently by construction: nothing errors, the
 * container stays up, and the only symptom is a report that did not arrive
 * or an audit whose figures are a week old. The arithmetic below is the
 * whole of what can go wrong — a job scheduled a day late after a restart,
 * a monthly job that lands in the wrong month at a year boundary, or one
 * that fires twice because "next" came out as "now".
 *
 * The times are read out of scripts/cron.mjs rather than restated here, so
 * a change to the schedule cannot leave this file testing the old one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "scripts/cron.mjs"), "utf8");

/**
 * The scheduler is a plain .mjs script with no exports — it starts working
 * the moment it is imported, which is right for a container entry point
 * and wrong for a test. The one pure function in it is lifted out by name
 * and evaluated on its own.
 */
function loadNextRun(): (job: { at: number[]; day?: number }, now: Date) => Date {
  const start = source.indexOf("function nextRun(");
  expect(start, "nextRun not found in scripts/cron.mjs").toBeGreaterThan(-1);

  const end = source.indexOf("\nasync function run(", start);
  const body = source.slice(start, end);

  return new Function(`${body}; return nextRun;`)() as ReturnType<typeof loadNextRun>;
}

const nextRun = loadNextRun();

/** The schedule the script actually ships with. */
function jobs(): { name: string; path: string; at: number[]; day?: number }[] {
  const block = source.slice(source.indexOf("const JOBS = ["), source.indexOf("];", source.indexOf("const JOBS = [")) + 2);
  return new Function(`${block}; return JOBS;`)();
}

const local = (iso: string) => new Date(iso);

describe("nextRun", () => {
  it("picks today when the time has not passed", () => {
    const at = nextRun({ at: [3, 15] }, local("2026-09-26T01:00:00"));
    expect(at.getDate()).toBe(26);
    expect([at.getHours(), at.getMinutes()]).toEqual([3, 15]);
  });

  it("picks tomorrow once it has", () => {
    const at = nextRun({ at: [3, 15] }, local("2026-09-26T09:00:00"));
    expect(at.getDate()).toBe(27);
    expect([at.getHours(), at.getMinutes()]).toEqual([3, 15]);
  });

  it("does not skip a day when the container restarts a minute before", () => {
    // The case a fixed 24-hour sleep gets wrong: a restart at 03:14 must
    // still run at 03:15, not tomorrow.
    const at = nextRun({ at: [3, 15] }, local("2026-09-26T03:14:00"));
    expect(at.getDate()).toBe(26);
    expect(at.getHours()).toBe(3);
  });

  it("never returns a time in the past", () => {
    // "Next" coming out as "now or earlier" means setTimeout fires
    // immediately and reschedules to the same instant — a job running in a
    // tight loop.
    for (const hour of [0, 3, 8, 12, 23]) {
      for (const day of [1, 15, 28]) {
        const now = local(`2026-09-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:15:00`);
        for (const job of jobs()) {
          expect(nextRun(job, now).getTime(), `${job.name} at ${now.toISOString()}`).toBeGreaterThan(
            now.getTime(),
          );
        }
      }
    }
  });

  it("rolls a daily job over the end of the month", () => {
    const at = nextRun({ at: [3, 15] }, local("2026-09-30T23:00:00"));
    expect([at.getMonth(), at.getDate()]).toEqual([9, 1]); // 1 October
  });

  it("rolls a daily job over the end of the year", () => {
    const at = nextRun({ at: [3, 15] }, local("2026-12-31T23:00:00"));
    expect(at.getFullYear()).toBe(2027);
    expect([at.getMonth(), at.getDate()]).toEqual([0, 1]);
  });
});

describe("the monthly job", () => {
  it("runs on the 1st of next month when this month's has passed", () => {
    const at = nextRun({ at: [8, 0], day: 1 }, local("2026-09-15T12:00:00"));
    expect([at.getMonth(), at.getDate(), at.getHours()]).toEqual([9, 1, 8]); // 1 Oct, 08:00
  });

  it("runs today when it is the 1st and the hour has not come", () => {
    const at = nextRun({ at: [8, 0], day: 1 }, local("2026-09-01T06:00:00"));
    expect([at.getMonth(), at.getDate()]).toEqual([8, 1]); // still 1 September
  });

  it("moves to October when the 1st is already over", () => {
    const at = nextRun({ at: [8, 0], day: 1 }, local("2026-09-01T09:00:00"));
    expect([at.getMonth(), at.getDate()]).toEqual([9, 1]);
  });

  it("crosses into the new year from December", () => {
    const at = nextRun({ at: [8, 0], day: 1 }, local("2026-12-01T09:00:00"));
    expect(at.getFullYear()).toBe(2027);
    expect([at.getMonth(), at.getDate()]).toEqual([0, 1]);
  });

  it("lands on the 1st from the 31st", () => {
    /*
      The day of the month is set before the month is advanced, so by the
      time the roll-over happens the date is already the 1st and the month
      arithmetic has nothing awkward to do. The day argument passed to
      setMonth alongside it is defensive rather than load-bearing here —
      it only matters for a monthly job on a day later than the 28th,
      which this schedule does not have.
    */
    const at = nextRun({ at: [8, 0], day: 1 }, local("2026-01-31T12:00:00"));
    expect([at.getMonth(), at.getDate()]).toEqual([1, 1]); // 1 February
  });

  it("keeps a late-in-the-month job on its own day", () => {
    // The case the day argument to setMonth is actually there for: a job
    // on the 30th, scheduled from a date where a bare setMonth(+1) would
    // have carried a rolled-over day forward.
    const at = nextRun({ at: [8, 0], day: 30 }, local("2026-03-30T09:00:00"));
    expect([at.getMonth(), at.getDate()]).toEqual([3, 30]); // 30 April
  });
});

describe("the shipped schedule", () => {
  it("covers all three endpoints that exist", () => {
    const paths = jobs().map((job) => job.path).sort();
    expect(paths).toEqual([
      "/api/cron/monthly-report",
      "/api/cron/seo-audit",
      "/api/cron/vitals-rollup",
    ]);
  });

  it("leaves a gap between the two jobs that check alerts", () => {
    /*
      Both the audit and the rollup run the alert checks when they finish,
      and an alert is suppressed if the same one fired within the day. Back
      to back, the second job's checks would all be suppressed as
      duplicates of the first's — so the gap is deliberate and asserted.
    */
    const byName = Object.fromEntries(jobs().map((job) => [job.name, job]));
    const minutes = (job: { at: number[] }) => job.at[0] * 60 + job.at[1];

    expect(minutes(byName["vitals-rollup"]) - minutes(byName["seo-audit"])).toBeGreaterThanOrEqual(
      15,
    );
  });

  it("sends the monthly report during office hours", () => {
    // It is read over breakfast, not found at three in the morning.
    const report = jobs().find((job) => job.name === "monthly-report")!;
    expect(report.day).toBe(1);
    expect(report.at[0]).toBeGreaterThanOrEqual(7);
    expect(report.at[0]).toBeLessThanOrEqual(10);
  });
});
