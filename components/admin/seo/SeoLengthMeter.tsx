"use client";

/**
 * components/admin/seo/SeoLengthMeter.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Is this meta title the right length", answered the same way everywhere.
 *
 * It was answered two ways. SeoPreviewFields (events, news) drew a bar
 * that filled emerald inside lib/seo-limits.ts's min–max band and amber
 * outside it; PageSeoEditor (projects) drew a "23/60" counter that went
 * red past the maximum and knew nothing about the minimum. A 23-character
 * title was therefore fine on the project SEO tab and flagged as too short
 * on the news and event forms — the same string, the same limits file, two
 * verdicts, and no way for whoever wrote it to tell which screen was
 * right.
 *
 * SEO_LIMITS is the authority for both bounds. Going under wastes the
 * snippet space Google gives a result and going over risks truncation,
 * which is why neither is a hard `maxLength` on the input: they are
 * pixel-width approximations, and a field that refuses the 61st character
 * would be asserting a precision this data does not have.
 *
 * `hint` is optional — the wording of the recommendation, when the caller
 * has one. `overLabel` is appended once the maximum is passed, for the
 * callers that spell that out in words as well as in colour.
 * ─────────────────────────────────────────────────────────────────────────
 */

export default function SeoLengthMeter({
  length,
  min,
  max,
  hint,
  overLabel,
}: {
  length: number;
  min: number;
  max: number;
  /** e.g. "Ideal length: 30–60 characters". */
  hint?: string;
  /** Appended after the count once `length` exceeds `max`. */
  overLabel?: string;
}) {
  const over = length > max;
  const inRange = length >= min && !over;

  return (
    <>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-primary/10">
        <div
          className={`h-full rounded-full transition-[width] ${inRange ? "bg-emerald-600" : "bg-amber-500"}`}
          // Past the maximum the bar is full and the colour carries the
          // rest; letting it compute past 100% would overflow the track.
          style={{ width: `${Math.min(100, Math.round((length / max) * 100))}%` }}
        />
      </div>

      <div className="mt-1.5 flex items-baseline justify-between gap-3">
        <p className="text-xs leading-relaxed text-ink-muted">{hint}</p>
        <p className={`shrink-0 text-xs tabular-nums ${over ? "font-semibold text-amber-700" : "text-ink"}`}>
          {/* The bare count, not "23/60": the min–max range is already in
              the hint beside it, and repeating the ceiling would put the
              same number twice on one row. */}
          {length}
          {over && overLabel && ` · ${overLabel}`}
        </p>
      </div>
    </>
  );
}
