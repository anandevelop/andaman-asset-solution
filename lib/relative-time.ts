/**
 * lib/relative-time.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "2 hours ago" / "เมื่อวาน" / "3 週間前" — the admin list pages' "last
 * edited" column (Projects.dc.html's แก้ไขล่าสุด).
 *
 * Intl.RelativeTimeFormat rather than a set of translated strings, because
 * the four locales this site ships disagree about more than vocabulary:
 * Russian pluralises by three forms (1 час / 2 часа / 5 часов), Thai and
 * Chinese by none, and English by two. A hand-written key per unit would
 * have to encode all of that in messages/*.json and get it right four
 * times; the platform already knows it.
 *
 * `numeric: "auto"` is what turns -1 day into "yesterday"/"เมื่อวาน"
 * rather than "1 day ago" — the wording the mockup's own column uses.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { intlLocale } from "@/lib/format";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
/** Calendar months vary; this is the display threshold, not a date calculation. */
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/**
 * A past (or future) instant as a short relative phrase in `locale`.
 *
 * The unit is chosen by magnitude so the phrase stays two words at every
 * scale — an edit five weeks old reads "last month", not "35 days ago".
 */
export function relativeTime(locale: string, at: Date, now: Date = new Date()): string {
  const format = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
  const diff = at.getTime() - now.getTime();
  const abs = Math.abs(diff);

  // "now" rather than "0 seconds ago" — numeric: "auto" handles the wording.
  if (abs < MINUTE) return format.format(0, "second");
  if (abs < HOUR) return format.format(Math.round(diff / MINUTE), "minute");
  if (abs < DAY) return format.format(Math.round(diff / HOUR), "hour");
  if (abs < WEEK) return format.format(Math.round(diff / DAY), "day");
  if (abs < MONTH) return format.format(Math.round(diff / WEEK), "week");
  if (abs < YEAR) return format.format(Math.round(diff / MONTH), "month");
  return format.format(Math.round(diff / YEAR), "year");
}
