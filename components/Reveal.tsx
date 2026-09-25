"use client";

import { motion, type Variants } from "framer-motion";

type RevealProps = {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  /** For when this wrapper is also an in-page anchor target — the projects
   *  grid pairs it with scroll-mt so the navbar doesn't cover the landing. */
  id?: string;
  /** whileInView's rootMargin. Defaults to "-80px" (shrink every edge, so a
   *  section barely peeking over the fold doesn't fire early) — override
   *  when that horizontal shrink is wrong for the layout, e.g.
   *  SalesTeamSection's mobile row, where a card sitting mostly off-screen
   *  to the right is deliberately peeking a little as a "swipe for more"
   *  hint; the default margin reads that sliver as still outside the root
   *  and leaves it stuck at opacity 0 until the visitor swipes further. */
  margin?: `${number}px` | `${number}px ${number}px` | `${number}px ${number}px ${number}px ${number}px`;
  /** Fires the moment this wrapper's own whileInView trigger fires — the
   *  same visibility check that starts its fade-up, exposed so a count-up
   *  or similar one-shot effect inside it can start on that exact frame
   *  instead of running its own separate IntersectionObserver that could
   *  fire at a different scroll position. */
  onEnter?: () => void;
};

const variants: Variants = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Fades + slides content into view once as it scrolls into the viewport.
 * Respects prefers-reduced-motion via framer-motion's built-in handling.
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
 * reason than it looks broken for. framer-motion drives the transition
 * to "visible" over the full 0.7s via requestAnimationFrame, but
 * window.print() can block the main thread the instant the dialog opens
 * — often before that animation has run more than a frame or two — so
 * the printed page caught it mid-fade instead of either state cleanly.
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
  return (
    <motion.div
      id={id}
      className={["reveal", className].filter(Boolean).join(" ")}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin }}
      variants={variants}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
      onViewportEnter={onEnter}
    >
      {children}
    </motion.div>
  );
}
