"use client";

/**
 * components/unit-types/LiftPanel.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The FLOOR display and the row of lift buttons.
 *
 * The display counts like a real lift's: the digits sit in a column that
 * slides, rather than being swapped out, so going from G to 2 visibly
 * travels past 1. That is the whole reason this reads as a lift instead of
 * as a tab bar, and it is why the column holds every floor's label at once.
 *
 * Buttons run bottom-to-top — `flex-col-reverse` — because the ground floor
 * belongs at the bottom of a lift panel. Reversing the visual order rather
 * than the array keeps index 0 as the ground floor everywhere else.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { ElevatorFloor, ElevatorLabels } from "./types";

/** Height of one digit cell; the column slides by a multiple of this. */
const DIGIT_HEIGHT = 44;

type Props = {
  floors: ElevatorFloor[];
  activeIndex: number;
  /** Which way the car is travelling right now, for the arrow. */
  direction: 1 | -1 | 0;
  moving: boolean;
  labels: ElevatorLabels;
  onSelect: (index: number) => void;
};

export default function LiftPanel({
  floors,
  activeIndex,
  direction,
  moving,
  labels,
  onSelect,
}: Props) {
  return (
    /* @min-[1000px]:self-start — the panel belongs at the top of the shaft's height,
       like a real lift's. Left to the grid it stretches and centres, which
       floats the FLOOR display halfway down a 560px column. */
    <div className="flex items-center justify-center gap-4 self-stretch border-b border-[#c3d3dd]/12 px-4 py-3 @min-[1000px]:h-full @min-[1000px]:flex-col @min-[1000px]:justify-start @min-[1000px]:gap-6 @min-[1000px]:border-b-0 @min-[1000px]:border-r @min-[1000px]:px-0 @min-[1000px]:py-7">
      {/* ── FLOOR display ──────────────────────────────────────────── */}
      {/* Narrow screens: the label alone. The rolling digit only repeated
          the highlighted button beside it — in a row, the button already
          says which floor this is — and doubled the panel's height. */}
      <span className="pl-[0.32em] text-[8.5px] font-medium uppercase tracking-[0.32em] text-white/40 @min-[1000px]:hidden">
        {labels.floor}
      </span>

      <div className="relative hidden w-16 pb-3.5 text-center @min-[1000px]:block">
        <span className="mb-2 block pl-[0.32em] text-[8.5px] font-medium uppercase tracking-[0.32em] text-white/40">
          {labels.floor}
        </span>

        <div className="h-11 overflow-hidden" aria-hidden>
          <div
            className="transition-transform duration-700 ease-[cubic-bezier(.65,0,.35,1)] motion-reduce:transition-none"
            style={{ transform: `translateY(-${activeIndex * DIGIT_HEIGHT}px)` }}
          >
            {floors.map((floor) => (
              <span
                key={floor.id}
                className="block text-[32px] font-extralight leading-[44px] tracking-[0.02em] text-[#f3dcc4]"
                style={{ height: DIGIT_HEIGHT }}
              >
                {floor.shortLabel}
              </span>
            ))}
          </div>
        </div>

        {/* Sand hairline under the display. */}
        <span className="absolute bottom-0 left-1/2 h-px w-[22px] -translate-x-1/2 bg-accent opacity-70" />

        {direction !== 0 && (
          <span
            aria-hidden
            className={`absolute -top-0.5 right-0.5 text-[8px] text-accent transition-opacity ${
              moving ? "animate-pulse opacity-90" : "opacity-0"
            }`}
          >
            {direction > 0 ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* ── Buttons ────────────────────────────────────────────────── */}
      <div
        role="group"
        aria-label={labels.floorSelector}
        className="flex flex-row items-center gap-1.5 @min-[1000px]:flex-col-reverse"
      >
        {floors.map((floor, index) => {
          const active = index === activeIndex;

          return (
            <button
              key={floor.id}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={floor.name}
              aria-pressed={active}
              /*
                Minimal: no axis line, no halo, no fill. The selected floor
                is the one with a sand outline; the rest are bare digits
                until hovered. The line and the halo were drawn to make it
                read as a lift panel, and next to the rolling display and the
                type cards it was three rings saying the same thing.
              */
              className={`h-8 w-8 rounded-full border text-[13px] font-light tracking-[0.04em] transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                active
                  ? "border-accent/70 text-accent"
                  : "border-transparent text-white/60 hover:border-[#c3d3dd]/25 hover:text-white"
              }`}
            >
              {floor.shortLabel}
            </button>
          );
        })}
      </div>
    </div>
  );
}
