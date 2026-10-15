"use client";

/**
 * components/useNearViewport.ts
 * ─────────────────────────────────────────────────────────────────────────
 * `true` once the element comes within `margin` of the viewport — and
 * stays true. Drives the project page's deferred sections
 * (components/LazyProjectSections.tsx, components/LazyLeadForm.tsx): their
 * JavaScript is only fetched when a visitor is about to reach them.
 *
 * Also flips straight away when the visitor is being sent somewhere on the
 * page — opened at a #hash, or a click on an in-page link — so a deferred
 * section between them and the target is already loading while the
 * browser scrolls. (Chrome's scroll anchoring keeps the target in place if
 * a section above it grows when it arrives.)
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState, type RefObject } from "react";

export const NEAR_VIEWPORT_MARGIN = "900px 0px";

export function useNearViewport(
  ref: RefObject<Element | null>,
  { margin = NEAR_VIEWPORT_MARGIN, event }: { margin?: string; event?: string } = {},
): boolean {
  const [near, setNear] = useState(false);

  useEffect(() => {
    if (near) return;
    const load = () => setNear(true);

    if (window.location.hash.length > 1 || !ref.current || !("IntersectionObserver" in window)) {
      load();
      return;
    }

    const onClick = (e: MouseEvent) => {
      const href = (e.target as Element | null)?.closest?.("a[href]")?.getAttribute("href") ?? "";
      if (href.startsWith("#") && href.length > 1) load();
    };
    window.addEventListener("hashchange", load);
    document.addEventListener("click", onClick, true);
    if (event) window.addEventListener(event, load);

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load();
      },
      { rootMargin: margin },
    );
    observer.observe(ref.current);

    return () => {
      observer.disconnect();
      window.removeEventListener("hashchange", load);
      document.removeEventListener("click", onClick, true);
      if (event) window.removeEventListener(event, load);
    };
  }, [near, ref, margin, event]);

  return near;
}
