"use client";

/**
 * components/FacilityScroller.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The >4-facilities case of the Facilities section on the project page —
 * a single horizontal row of photo cards (see FacilityCard) with
 * snap-scroll for touch/mouse-drag, plus a pair of ‹ › buttons on desktop
 * that step exactly one card at a time. Pulled into its own client
 * component because button state (which one that is disabled) and the
 * scroll-by-one-card math both need refs/effects — the surrounding
 * project page is an async Server Component and can't hold either.
 *
 * The ≤4 case (a plain, non-scrolling grid) stays inline in page.tsx —
 * it never needs any of this, so there's no reason to pull it behind a
 * client boundary too.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import FacilityCard from "@/components/FacilityCard";
import type { ProjectFacilitySummary } from "@/lib/projects";

type Props = {
  facilities: ProjectFacilitySummary[];
};

// A couple of px of slack on the edge checks — scrollWidth/clientWidth can
// disagree with scrollLeft by a fraction of a pixel after a smooth-scroll
// settles, which would otherwise leave the "next" button stuck disabled
// (or enabled with nowhere left to go) right at the end of the track.
const EDGE_EPSILON_PX = 2;

export default function FacilityScroller({ facilities }: Props) {
  const trackRef = useRef<HTMLUListElement>(null);
  const firstCardRef = useRef<HTMLLIElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > EDGE_EPSILON_PX);
    setCanScrollRight(
      el.scrollLeft + el.clientWidth < el.scrollWidth - EDGE_EPSILON_PX,
    );
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    // Fires on drag-scroll, wheel, and the buttons' own scrollBy alike —
    // one listener covers every way the track can move, so button state
    // never drifts out of sync with what's actually on screen.
    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });

    // Re-checks on resize/orientation-change (card width, and therefore
    // whether everything now fits without scrolling at all, can change
    // without the track itself firing a scroll event).
    const observer = new ResizeObserver(updateEdges);
    observer.observe(el);

    return () => {
      el.removeEventListener("scroll", updateEdges);
      observer.disconnect();
    };
    // facilities.length: a project page navigation (client-side route
    // change to a different project) can swap the list under the same
    // mounted component, which changes scrollWidth without a resize.
  }, [updateEdges, facilities.length]);

  const scrollByOneCard = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = firstCardRef.current;
    if (!track || !card) return;

    // Read the gap the track is actually rendering with, rather than
    // hardcoding the 12px/16px from the className below — so this can't
    // silently drift out of sync with a future breakpoint tweak there.
    const gapPx = parseFloat(getComputedStyle(track).columnGap || "0");
    const distance = card.getBoundingClientRect().width + gapPx;

    track.scrollBy({ left: distance * direction, behavior: "smooth" });
  };

  const buttonClass =
    "absolute top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center " +
    "rounded-full border border-primary/10 bg-white text-primary shadow-card transition-opacity " +
    "hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-0 sm:flex";

  return (
    <div className="relative">
      <ul
        ref={trackRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pb-1
          [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4
          [&::-webkit-scrollbar]:hidden"
      >
        {facilities.map((facility, index) => (
          <li
            key={facility.id}
            ref={index === 0 ? firstCardRef : undefined}
            // Widths solved from the gap above, not guessed: mobile fits
            // 2.2 cards across a gap-3 (12px) track, desktop fits exactly
            // 4 across a gap-4 (16px) track — 3 gaps between 4 cards.
            className="w-[calc((100%_-_12px)/2.2)] shrink-0 snap-start sm:w-[calc((100%_-_3*16px)/4)]"
          >
            <FacilityCard facility={facility} />
          </li>
        ))}
      </ul>

      <button
        type="button"
        aria-label="Previous"
        onClick={() => scrollByOneCard(-1)}
        disabled={!canScrollLeft}
        className={`${buttonClass} -left-5`}
      >
        <ChevronLeft size={18} aria-hidden />
      </button>
      <button
        type="button"
        aria-label="Next"
        onClick={() => scrollByOneCard(1)}
        disabled={!canScrollRight}
        className={`${buttonClass} -right-5`}
      >
        <ChevronRight size={18} aria-hidden />
      </button>
    </div>
  );
}
