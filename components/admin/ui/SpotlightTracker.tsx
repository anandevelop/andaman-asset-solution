"use client";

/**
 * components/admin/ui/SpotlightTracker.tsx — feeds the card spotlight
 * (`.admin-card[data-spot]` in globals.css) the pointer position. One
 * delegated listener for the whole back office instead of one per card;
 * it writes two custom properties on the card under the pointer and
 * nothing else. Skipped entirely under reduced motion.
 */

import { useEffect } from "react";

export default function SpotlightTracker() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.<HTMLElement>("[data-spot]");
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - box.left}px`);
      card.style.setProperty("--my", `${event.clientY - box.top}px`);
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    return () => document.removeEventListener("pointermove", onMove);
  }, []);
  return null;
}
