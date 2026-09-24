"use client";

/**
 * components/admin/DateTimeField.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * A date-and-time field whose calendar speaks the language the back office
 * is set to.
 *
 * It exists because `<input type="datetime-local">` cannot be made to.
 * Chromium renders the native picker — the month names, the weekday
 * initials, the buttons and the value format — in the *browser's* UI
 * language, and ignores both `<html lang>` and a `lang` attribute on the
 * input itself. Verified rather than assumed: with the browser set to
 * Thai, an input carrying `lang="en"` inside a `lang="en"` document still
 * rendered `21/09/2026` and a Thai calendar. So an administrator who had
 * switched the admin to English still got a Thai picker, and there was no
 * attribute, property or stylesheet that would change it. The only way for
 * the calendar to follow our own locale is for the calendar to be ours.
 *
 * The form contract is deliberately identical to the input it replaces: a
 * hidden field submits the same `"YYYY-MM-DDTHH:mm"` string under the same
 * name, and empty still means "no date set" — see `optionalDateTime` in
 * lib/validations.ts, and the callers that read it. Nothing on the server
 * had to change.
 *
 * Dates are formatted through lib/format.ts's `intlLocale`, the same
 * helper the rest of the admin formats through, so this reads the way
 * MediaLibrary and the news list already do. In Thai that means a Buddhist
 * year (2569 for 2026) — locale-correct, consistent with the rest of the
 * back office, and a difference from the native picker, which always
 * showed a Gregorian one.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { intlLocale, toDateTimeLocal } from "@/lib/format";

type Props = {
  /** Matches the <label for> the surrounding Field renders. */
  id: string;
  name: string;
  /** "YYYY-MM-DDTHH:mm", or "" for unset. */
  defaultValue?: string;
  className?: string;
};

/**
 * Parsed by hand rather than handed to `new Date(string)`. A bare
 * "YYYY-MM-DDTHH:mm" is local time, but a date-only "YYYY-MM-DD" is UTC —
 * the kind of difference that turns into an off-by-one day for anyone east
 * of Greenwich, which is everyone using this.
 */
function parseLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The panel's rendered height: a six-week grid plus the month header,
 *  the time row and the actions. Fixed, because the grid always draws 42
 *  cells — see monthGrid. Used only to decide which way to open. */
const PANEL_HEIGHT = 380;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * The six-week grid for a month, always 42 cells so the popover does not
 * change height from month to month and shift the controls under the
 * pointer mid-click.
 *
 * Weeks start on Sunday, which is what both of the admin's locales use —
 * revisit if a locale that starts on Monday is ever added, because
 * Intl exposes no first-day-of-week in the baseline we target.
 */
function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export default function DateTimeField({ id, name, defaultValue = "", className = "" }: Props) {
  const locale = useLocale();
  const t = useTranslations("admin");
  const loc = intlLocale(locale);

  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => parseLocal(value), [value]);

  // The month on screen. Seeded from the value so opening a scheduled
  // article lands on the month it is scheduled in, not on today.
  const [view, setView] = useState(() => {
    const d = parseLocal(defaultValue);
    return { year: d ? d.getFullYear() : new Date().getFullYear(), month: d ? d.getMonth() : new Date().getMonth() };
  });

  // Which day owns the grid's single tab stop. A roving tabindex, so the
  // calendar is one stop in the tab order and the arrow keys move within
  // it — 42 separate tab stops would be a trap to get past.
  const [focusedDay, setFocusedDay] = useState<Date | null>(null);

  // Opens upward when there is not room below. This field sits near the
  // bottom of a long form, where a panel this tall otherwise hangs off the
  // viewport and has to be scrolled to — which also moves the trigger out
  // from under the pointer. The native picker flipped; so does this.
  const [dropUp, setDropUp] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(loc, { month: "long", year: "numeric" }).format(new Date(view.year, view.month, 1)),
    [loc, view],
  );

  const weekdays = useMemo(() => {
    /*
      "narrow", not "short". Thai's short weekday is not a stable width
      across ICU builds — Node 24 here abbreviates it to "อา.", while the
      CI runner and Chromium both spell it "อาทิตย์", which is six
      characters trying to fit a seventh of a 19rem panel. Narrow is
      "อา จ อ พ พฤ ศ ส", which is what Chromium's own Thai picker showed,
      and "S M T W T F S" in English.

      Narrow repeats letters in English, but this row is aria-hidden and
      every day button carries a full written date as its accessible
      name, so nothing is resolved by these glyphs alone.
    */
    const fmt = new Intl.DateTimeFormat(loc, { weekday: "narrow" });
    // 2024-01-07 was a Sunday; any known Sunday works as the anchor.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 7 + i)));
  }, [loc]);

  const dayLabel = useMemo(() => new Intl.DateTimeFormat(loc, { dateStyle: "full" }), [loc]);

  const display = useMemo(() => {
    if (!selected) return null;
    return new Intl.DateTimeFormat(loc, { dateStyle: "medium", timeStyle: "short" }).format(selected);
  }, [loc, selected]);

  // Close on an outside click or Escape, and hand focus back to the
  // trigger so the keyboard does not get dropped at the top of the page —
  // the same contract CountrySelect follows.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Move real focus to whichever day holds the tab stop, but only while
  // the arrow keys are driving — grabbing focus on open would scroll a
  // long form to the grid.
  useEffect(() => {
    if (!open || !focusedDay) return;
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${toDateTimeLocal(focusedDay).slice(0, 10)}"]`);
    el?.focus();
  }, [open, focusedDay]);

  function commit(next: Date) {
    setValue(toDateTimeLocal(next));
    setView({ year: next.getFullYear(), month: next.getMonth() });
  }

  /** Picking a day keeps the time already set, and otherwise starts from
   *  the current one — a scheduled post almost always means "this day, at
   *  about the time I am working", not "this day at midnight". */
  function pickDay(day: Date) {
    const base = selected ?? new Date();
    commit(new Date(day.getFullYear(), day.getMonth(), day.getDate(), base.getHours(), base.getMinutes()));
  }

  function setTime(part: "h" | "m", n: number) {
    const base = selected ?? new Date();
    const next = new Date(base);
    if (part === "h") next.setHours(n);
    else next.setMinutes(n);
    commit(next);
  }

  function shiftView(by: number) {
    setView((v) => {
      const d = new Date(v.year, v.month + by, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  function onGridKeyDown(event: React.KeyboardEvent, day: Date) {
    const moves: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, PageUp: -28, PageDown: 28,
    };
    const step = moves[event.key];
    if (step === undefined) return;

    event.preventDefault();
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + step);
    setFocusedDay(next);
    setView({ year: next.getFullYear(), month: next.getMonth() });
  }

  const days = monthGrid(view.year, view.month);
  const today = new Date();
  const tabStop = focusedDay ?? selected ?? today;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {/* The value the form actually submits — same name, same format, and
          same "" for unset as the native input it replaces. */}
      <input type="hidden" name={name} value={value} />

      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => {
          const rect = triggerRef.current?.getBoundingClientRect();
          // Measured against the panel's own height, not a guess: it is a
          // fixed six-week grid plus two fixed rows, so it does not vary.
          if (rect) setDropUp(window.innerHeight - rect.bottom < PANEL_HEIGHT && rect.top > PANEL_HEIGHT);
          setOpen((v) => !v);
        }}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="admin-input flex w-full items-center justify-between gap-3 text-left"
      >
        <span className={display ? "" : "text-ink-muted"}>{display ?? t("dateTime.empty")}</span>
        <CalendarDays size={16} className="shrink-0 text-ink-muted" aria-hidden />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={t("dateTime.open")}
          className={`absolute left-0 z-30 w-[19rem] max-w-[calc(100vw-2.5rem)] rounded-xs border border-primary/15 bg-surface-raised p-3 shadow-lg ${
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftView(-1)}
              aria-label={t("dateTime.previousMonth")}
              className="rounded-xs p-1.5 text-ink-muted transition-colors hover:bg-primary/5 hover:text-primary"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            {/* aria-live so arrowing across a month boundary is announced —
                otherwise the grid silently becomes a different month. */}
            <p aria-live="polite" className="text-sm font-medium text-primary">
              {monthLabel}
            </p>
            <button
              type="button"
              onClick={() => shiftView(1)}
              aria-label={t("dateTime.nextMonth")}
              className="rounded-xs p-1.5 text-ink-muted transition-colors hover:bg-primary/5 hover:text-primary"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5" aria-hidden>
            {weekdays.map((w, i) => (
              <span key={i} className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                {w}
              </span>
            ))}
          </div>

          <div ref={gridRef} role="grid" aria-label={monthLabel} className="grid grid-cols-7 gap-0.5">
            {days.map((day) => {
              const outside = day.getMonth() !== view.month;
              const isSelected = selected ? sameDay(day, selected) : false;
              const isToday = sameDay(day, today);

              return (
                <button
                  key={day.getTime()}
                  type="button"
                  role="gridcell"
                  data-day={toDateTimeLocal(day).slice(0, 10)}
                  tabIndex={sameDay(day, tabStop) ? 0 : -1}
                  aria-label={dayLabel.format(day)}
                  aria-selected={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  onKeyDown={(e) => onGridKeyDown(e, day)}
                  onClick={() => {
                    pickDay(day);
                    setFocusedDay(day);
                  }}
                  className={[
                    "rounded-xs py-1.5 text-sm transition-colors",
                    isSelected
                      ? "bg-primary font-medium text-white"
                      : outside
                        ? "text-ink-muted/50 hover:bg-primary/5"
                        : "text-ink hover:bg-primary/5",
                    !isSelected && isToday ? "ring-1 ring-inset ring-accent" : "",
                  ].join(" ")}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          {/* Two selects rather than <input type="time">, which Chromium
              localizes from the browser language exactly like the calendar
              this component exists to replace. 24-hour and numeric reads
              the same in both admin locales. */}
          <div className="mt-3 flex items-center gap-2 border-t border-primary/10 pt-3">
            <span className="admin-label mb-0 shrink-0">{t("dateTime.time")}</span>
            <select
              aria-label={t("dateTime.hour")}
              value={selected ? selected.getHours() : 0}
              onChange={(e) => setTime("h", Number(e.target.value))}
              className="admin-input w-auto py-1.5"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}</option>
              ))}
            </select>
            <span aria-hidden className="text-ink-muted">:</span>
            <select
              aria-label={t("dateTime.minute")}
              value={selected ? selected.getMinutes() : 0}
              onChange={(e) => setTime("m", Number(e.target.value))}
              className="admin-input w-auto py-1.5"
            >
              {Array.from({ length: 60 }, (_, m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setValue("");
                setFocusedDay(null);
              }}
              className="text-xs font-medium text-ink-muted transition-colors hover:text-primary"
            >
              {t("dateTime.clear")}
            </button>
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                commit(now);
                setFocusedDay(now);
              }}
              className="text-xs font-medium text-accent-700 transition-colors hover:text-accent-800"
            >
              {t("dateTime.now")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
