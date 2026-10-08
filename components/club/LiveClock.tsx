"use client";
/**
 * components/club/LiveClock.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The ticking "บัตรสด 14:24:28 · 7 ต.ค. 69" line. A screenshot freezes it,
 * which is the point: a partner shop can tell a live card from a picture.
 * Runs from the device clock, so it keeps ticking offline.
 *
 * Renders a fixed-width placeholder on the server and first paint (no
 * hydration mismatch, no layout shift), then the real time each second.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { useSyncExternalStore } from "react";
import { TIME_ZONE, formatDate } from "./format";

function subscribe(onTick: () => void) {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
}
const now = () => Math.floor(Date.now() / 1000);
const never = () => null;

type Props = { locale: string; label?: string; withDate?: boolean; className?: string; pulse?: boolean };

export default function LiveClock({ locale, label, withDate = true, className = "", pulse = true }: Props) {
  const second = useSyncExternalStore(subscribe, now, never);
  const date = second === null ? null : new Date(second * 1000);
  const time = date
    ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: TIME_ZONE }).format(date)
    : "--:--:--";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {pulse ? <i className="size-2 rounded-full bg-verify-ok animate-club-pulse shadow-[0_0_0_0_rgb(95_211_160/0.6)]" aria-hidden /> : null}
      {label ? <span>{label}</span> : null}
      <time className="font-mono tabular-nums" dateTime={date?.toISOString()} suppressHydrationWarning>
        {time}
      </time>
      {withDate ? <span suppressHydrationWarning>· {date ? formatDate(date, locale) : " ".repeat(9)}</span> : null}
    </span>
  );
}
