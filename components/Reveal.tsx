"use client";

import { useEffect, useRef, useState } from "react";

type RevealProps = {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  /** For when this wrapper is also an in-page anchor target — the projects
   *  grid pairs it with scroll-mt so the navbar doesn't cover the landing. */
  id?: string;
  /** The IntersectionObserver's rootMargin. Defaults to "-80px" (shrink every edge, so a
   *  section barely peeking over the fold doesn't fire early) — override
   *  when that horizontal shrink is wrong for the layout, e.g.
   *  SalesTeamSection's mobile row, where a card sitting mostly off-screen
   *  to the right is deliberately peeking a little as a "swipe for more"
   *  hint; the default margin reads that sliver as still outside the root
   *  and leaves it stuck at opacity 0 until the visitor swipes further. */
  margin?: `${number}px` | `${number}px ${number}px` | `${number}px ${number}px ${number}px ${number}px`;
  /** Fires the moment this wrapper's own visibility trigger fires — the
   *  same visibility check that starts its fade-up, exposed so a count-up
   *  or similar one-shot effect inside it can start on that exact frame
   *  instead of running its own separate IntersectionObserver that could
   *  fire at a different scroll position. */
  onEnter?: () => void;
};

/**
 * Fades + slides content into view once as it scrolls into the viewport.
 * Content that is already in the viewport when the page loads does not
 * animate: it is simply there. See the note in the effect below.
 *
 * An IntersectionObserver and a CSS transition (`.reveal` in globals.css),
 * not framer-motion. This wrapper is on every public page, and with the
 * navbar it was the only thing pulling framer-motion into the home page's
 * first load. Lighthouse put most of the hero's 5.7 s mobile LCP down to
 * script running before the photo could paint. The look is the same: 28px
 * up, 0.7s, the same curve, the same delay prop.
 *
 * The "reveal" class exists for exactly one consumer: app/globals.css's
 * `@media print` override, which forces this back to fully visible when
 * printing. whileInView only fires once a section has actually scrolled
 * past the viewport threshold, so anything a visitor has not yet
 * scrolled to is still sitting at opacity: 0 the moment they print —
 * privacy-policy/terms's "Download PDF" (window.print(), see
 * components/PrintButtons.tsx) produced a PDF missing every section
 * below the fold on a page nobody had scrolled down first.
 *
 * A CSS override, not a beforeprint/afterprint listener flipping this to
 * `animate="visible"`: that was tried first and is wrong for a subtler
 * reason than it looks broken for. the transition to "visible" runs over
 * the full 0.7s, but window.print() can block the main thread the instant
 * the dialog opens, often before more than a frame or two has run, so the
 * printed page caught it mid-fade instead of either state cleanly.
 * print media's layout pass happens independently of any JS timing, so
 * only a CSS rule is guaranteed to apply before the page is captured.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
  id,
  margin = "-80px",
  onEnter,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  // Latest callback without re-observing when a parent re-renders.
  const onEnterRef = useRef(onEnter);
  useEffect(() => {
    onEnterRef.current = onEnter;
  }, [onEnter]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    /*
      Only what starts off-screen is hidden to be revealed. The stylesheet
      hides `.reveal[data-armed]`, and the attribute is set here, in the
      browser, never in the HTML — so a section the visitor can already
      see is painted with the page, and stays put.

      It used to be the other way round: every wrapper left the server at
      opacity 0 and waited for this effect. On a phone that is the whole
      of a text page — heading, intro, the contact form — invisible until
      the JavaScript had downloaded and run, several seconds after the
      header had painted, and blank for good with JavaScript off.

      Set on the element rather than through state: React does not own
      this attribute, so there is nothing to mismatch on hydration and no
      second render for each of the hundred-odd wrappers on a page. The
      horizontal test is for sideways scrollers (SalesTeamSection's row),
      whose cards start off to the right.
    */
    const box = element.getBoundingClientRect();
    if (box.top >= window.innerHeight || box.left >= window.innerWidth) {
      element.setAttribute("data-armed", "");
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setShown(true);
        onEnterRef.current?.();
      },
      { rootMargin: margin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [margin]);

  return (
    <div
      ref={ref}
      id={id}
      className={["reveal", className].filter(Boolean).join(" ")}
      data-shown={shown ? "" : undefined}
      style={delay ? { transitionDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}
