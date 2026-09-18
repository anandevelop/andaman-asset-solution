"use client";

/**
 * components/AwardsScroller.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The scrollable row + prev/next controls for AwardsSection.tsx, split into
 * its own Client Component. AwardsSection itself is an async Server
 * Component (it awaits its own data fetch) — a "use client" directive can't
 * live in the same file as an async server export, so the interactive
 * sliver (scroll ref, click handlers, boundary state) lives here instead.
 * The already-rendered award cards are passed in as `children`, a normal
 * Server → Client Component boundary (RSC allows server-rendered JSX to be
 * passed as children into a client component without making the cards
 * themselves client-rendered).
 *
 * Previous design: a lone chevron badge floating mid-row (animate-
 * scroll-hint, tailwind.config.ts) that nudged a few times then sat still.
 * It covered card content it was supposed to be pointing at (see the
 * screenshot that prompted this change) and wasn't clickable — a hint with
 * nothing behind it. Replaced with real prev/next buttons below the row:
 * out of the way of the cards, and an actual control rather than a hint.
 *
 * Buttons disable (not hide) at each scroll boundary — tracked via a
 * scroll listener rather than assumed from index, since native touch-swipe
 * can move the scroll position without ever calling scrollBy.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  children: React.ReactNode;
  /** award.length equal-ish columns at lg:, first one wider — see AwardsSection. */
  gridTemplateColumns: string;
  labels: { previous: string; next: string };
};

export default function AwardsScroller({ children, gridTemplateColumns, labels }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const update = () => {
      setAtStart(el.scrollLeft <= 4);
      // -4px slack for sub-pixel rounding on some browsers/zoom levels.
      setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  const scrollByPage = (direction: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <div className="-mx-5 sm:mx-0">
      {/* Right-edge fade below lg: (where this row scrolls) — a hard crop
          at the viewport edge reads as "that's all of it" rather than
          "keep scrolling." mask-image fades the last 56px of the row to
          transparent regardless of container width (fixed px, not %, so
          it looks the same on a narrow phone and a tablet); the left edge
          stays fully opaque since nothing is hidden there at rest.
          Removed entirely at lg: — the row becomes a fully visible grid
          there, nothing to hint at.

          pt-16 gives the floating trophies (AwardsSection) room to bleed
          above each card without being clipped — overflow-x-auto forces
          the browser to compute overflow-y as auto too (CSS spec: one
          axis non-"visible" drags the other along), so without this
          padding the mobile scroll box would crop them at its own top
          edge even though the card itself has nothing clipping it. */}
      <div
        ref={scrollRef}
        className="mt-12 flex gap-6 overflow-x-auto px-5 pb-4 pt-16 [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-56px),transparent_100%)] mask-[linear-gradient(to_right,black_calc(100%-56px),transparent_100%)] sm:px-0 sm:scrollbar-thin lg:grid lg:overflow-visible lg:pb-0 lg:[-webkit-mask-image:none] lg:mask-none"
        style={{ gridTemplateColumns }}
      >
        {children}
      </div>

      {/* Prev/next — below the row, out of the cards' way, hidden at lg:
          where the row doesn't scroll. */}
      <div className="mt-2 flex justify-center gap-3 px-5 sm:px-0 lg:hidden">
        <button
          type="button"
          onClick={() => scrollByPage(-1)}
          disabled={atStart}
          aria-label={labels.previous}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/15 bg-white text-primary shadow-card transition-opacity disabled:opacity-30"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => scrollByPage(1)}
          disabled={atEnd}
          aria-label={labels.next}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/15 bg-white text-primary shadow-card transition-opacity disabled:opacity-30"
        >
          <ChevronRight size={18} strokeWidth={2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
