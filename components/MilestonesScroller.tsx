"use client";

/**
 * components/MilestonesScroller.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The scrollable row for the About page's "How we got here" timeline —
 * same split as AwardsScroller/AwardsSection and the same reason: the page
 * that renders it is an async Server Component, and a "use client"
 * directive can't live in the same file as one. The grid of cards is
 * built server-side in about/page.tsx and passed in as `children`.
 *
 * Unlike AwardsScroller, there is no lg: breakpoint where this becomes a
 * static grid, and this component has no opinion on what's inside it — the
 * card row and the year-group underlines below it are one CSS grid built
 * by the caller (about/page.tsx), so that a group's underline can span
 * exactly the width of its cards via `grid-column`. This file only owns
 * the scrolling box around that grid: the fade, the boundary tracking, the
 * prev/next buttons. A company's project history is inherently a
 * *sequence* — more will be added at the right end for as long as the
 * company exists — so it stays a horizontal scroller at every width, wide
 * screens included.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type Props = {
  children: React.ReactNode;
  labels: { previous: string; next: string };
};

export default function MilestonesScroller({ children, labels }: Props) {
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
      {/* Right-edge fade — a hard crop at the container edge reads as
          "that's all of it" rather than "keep scrolling." Fixed px, not %,
          so it looks the same regardless of container width; the left
          edge stays fully opaque since nothing is hidden there at rest. */}
      <div
        ref={scrollRef}
        className="mt-6 overflow-x-auto px-5 pb-4 [-webkit-mask-image:linear-gradient(to_right,black_calc(100%-56px),transparent_100%)] mask-[linear-gradient(to_right,black_calc(100%-56px),transparent_100%)] sm:px-0 sm:scrollbar-thin"
      >
        {children}
      </div>

      {/* Prev/next — below the row, out of the cards' way. Shown at every
          width: unlike Awards, this row never stops scrolling. */}
      <div className="mt-2 flex justify-center gap-3 px-5 sm:px-0">
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
