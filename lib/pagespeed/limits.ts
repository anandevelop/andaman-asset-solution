/**
 * lib/pagespeed/limits.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The time rules of lib/pagespeed/run.ts, kept pure so tests can pin them:
 * the five-minute cache, the ten-minute cooldown between full scans, and
 * where "today" starts for the daily cap (midnight in Bangkok).
 * ─────────────────────────────────────────────────────────────────────────
 */

export const CACHE_MS = 5 * 60_000;
export const SCAN_COOLDOWN_MS = 10 * 60_000;
/** A scan whose state says "running" for longer than this crashed. */
export const SCAN_STALE_MS = 30 * 60_000;

export type RunSource = "scheduled" | "manual" | "test";

export type ScanState = {
  startedAt: string;
  finishedAt: string | null;
  total: number;
  done: number;
  failed: number;
  source: RunSource;
};

/** Midnight in Bangkok, as a UTC instant. */
export function startOfDayBangkok(now = new Date()): Date {
  const local = new Date(now.getTime() + 7 * 3_600_000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - 7 * 3_600_000);
}

/**
 * Whether a full scan may start now. Running blocks everyone (unless the
 * state is so old the scan must have crashed); the cooldown after a
 * finished scan blocks manual starts only, never the schedule.
 */
export function scanBlocked(
  state: ScanState | null,
  source: RunSource,
  now = Date.now(),
): { reason: "RUNNING" | "COOLDOWN"; until?: string } | null {
  if (!state) return null;
  const started = Date.parse(state.startedAt);
  if (!state.finishedAt && now - started < SCAN_STALE_MS) return { reason: "RUNNING" };
  if (source === "scheduled" || !state.finishedAt) return null;
  const until = Date.parse(state.finishedAt) + SCAN_COOLDOWN_MS;
  return now < until ? { reason: "COOLDOWN", until: new Date(until).toISOString() } : null;
}
