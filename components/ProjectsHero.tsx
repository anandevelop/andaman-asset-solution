"use client";

/**
 * components/ProjectsHero.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The header atop /projects — see app/[locale]/(site)/projects/page.tsx,
 * which owns the data fetch and the translations and hands this component
 * three plain, already-localized strings (same server/client division as
 * lib/hero-story.ts + HeroCarousel).
 *
 * Used to be one <Reveal> wrapping the eyebrow, heading and subtitle
 * together — a single flat fade-up with no sense of sequence, since all
 * three lines moved as one block. This staggers them instead (eyebrow,
 * then heading, then subtitle land in turn) and adds one small flourish
 * tying the three together: a thin accent rule that draws itself in from
 * the eyebrow's left edge once the eyebrow has landed — a quiet "cue" the
 * next line is coming, not just three fades happening to be offset.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { motion, type Variants } from "framer-motion";

type Props = {
  eyebrow: string;
  title: string;
  subtitle: string;
};

const container: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const item: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

export default function ProjectsHero({ eyebrow, title, subtitle }: Props) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={container}
      className="max-w-2xl"
    >
      <motion.div variants={item} className="flex items-center gap-4">
        <p className="eyebrow shrink-0">{eyebrow}</p>
        {/* The rule draws in on its own delay rather than the stagger's
            usual step — it is a follow-on to the eyebrow landing, not a
            third item in the sequence, so it gets a bespoke transition
            instead of `item`'s. origin-left + scaleX (not width) so the
            draw-in animates on the GPU rather than triggering layout. */}
        <motion.span
          aria-hidden
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="h-px flex-1 origin-left bg-accent/40"
        />
      </motion.div>

      <motion.h1
        variants={item}
        className="mt-3 text-4xl font-light text-primary sm:text-5xl"
      >
        {title}
      </motion.h1>

      <motion.p
        variants={item}
        className="mt-6 max-w-lg text-sm leading-relaxed text-ink/70 sm:text-base"
      >
        {subtitle}
      </motion.p>
    </motion.div>
  );
}
