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
    /* lg:self-start — the panel belongs at the top of the shaft's height,
       like a real lift's. Left to the grid it stretches and centres, which
       floats the FLOOR display halfway down a 560px column. */
    <div className="flex items-center justify-center gap-6 self-stretch border-b border-[#c3d3dd]/12 px-4 py-4 lg:h-full lg:flex-col lg:justify-start lg:gap-[30px] lg:border-b-0 lg:border-r lg:px-0 lg:py-[34px]">
      {/* ── FLOOR display ──────────────────────────────────────────── */}
      <div className="relative w-16 pb-2.5 text-center lg:pb-3.5">
        <span className="mb-1 block pl-[0.32em] text-[8.5px] font-medium uppercase tracking-[0.32em] text-white/40 lg:mb-2">
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
                className="block text-[40px] font-extralight leading-[44px] tracking-[0.02em] text-[#f3dcc4]"
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
        className="relative flex flex-row items-center gap-4 lg:flex-col-reverse"
      >
        {/* The panel's axis line, behind the buttons. */}
        <span
          aria-hidden
          className="absolute left-[22px] right-[22px] top-1/2 h-px bg-[#c3d3dd]/15 lg:left-1/2 lg:right-auto lg:top-[22px] lg:bottom-[22px] lg:h-auto lg:w-px"
        />

        {floors.map((floor, index) => {
          const active = index === activeIndex;

          return (
            <button
              key={floor.id}
              type="button"
              onClick={() => onSelect(index)}
              aria-label={floor.name}
              aria-pressed={active}
              className={`relative h-11 w-11 rounded-full border text-sm font-light tracking-[0.04em] transition-[color,border-color,background-color] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
                active
                  ? "border-accent text-accent"
                  : "border-[#c3d3dd]/30 text-white/70 hover:border-accent/60 hover:text-white"
              }`}
              /*
                An opaque base, not a translucent tint: the axis line above
                runs behind every button, and at 9% alpha it showed straight
                through the selected one as a bar across the digit.
              */
              style={{
                background: active
                  ? "linear-gradient(rgba(232,179,132,.09),rgba(232,179,132,.09)) #062538"
                  : "#062538",
              }}
            >
              {floor.shortLabel}
              {active && (
                <span
                  aria-hidden
                  className="absolute -inset-[5px] rounded-full border border-accent/30"
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
