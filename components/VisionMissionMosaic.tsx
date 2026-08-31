"use client";

/**
 * components/VisionMissionMosaic.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠ UNUSED as of the v3 pass on components/VisionMission.tsx, which
 * replaced this eight-photo bento grid with a two-photo overlapping stack
 * (denser wasn't the ask — "fewer photos, more depth" was). Left on disk
 * rather than deleted in case the bento treatment is wanted again
 * elsewhere; nothing currently imports this component.
 *
 * The photo mosaic that used to sit beside the Vision & Mission copy —
 * see components/VisionMission.tsx, which owns the section and the data.
 *
 * Eight real project photographs on a 4×4 grid — one 2×2 anchor, five
 * dominoes, two singles — as a straight "bento" grid of rounded-corner
 * rectangles, per direct reference images. This replaces a v2 pass that
 * rotated the same grid 45° into a tessellating diamond mosaic: that read
 * closer to the earlier "AWARD-WINNING SOFTWARE" diagonal-collage
 * reference than a v1 floating-diamond attempt did, but the brief then
 * moved to a bento-style reference instead (straight rounded rectangles,
 * no rotation) — so the rotation machinery (the rotated grid container,
 * the counter-rotated + oversized inner element, the fixed pixel grid
 * deliberately larger than its clipping box) is gone entirely. A bento
 * grid needs none of it: each cell is upright already, so the grid can
 * simply fill its own box at w-full/h-full instead of overflowing a
 * viewport it used to have to be safely clipped by at every breakpoint.
 *
 * No auto-cycling, no raised/active state: unlike the circular arc this
 * originally replaced, a mosaic has no single photo that makes sense to
 * raise above the rest — every cell reveals once with its own fade +
 * scale as it scrolls into view (the same whileInView/once pattern as
 * components/Reveal.tsx, just with a per-cell delay standing in for
 * Reveal's stagger instead of a shared parent orchestrating it).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { type CSSProperties } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

export type MosaicPhoto = {
  src: string;
  /** CSS grid-column / grid-row values, e.g. "1 / span 2". */
  col: string;
  row: string;
  alt: string;
};

const REVEAL_STEP = 0.09;

export default function VisionMissionMosaic({ photos }: { photos: MosaicPhoto[] }) {
  return (
    <div className="mx-auto grid aspect-square w-full max-w-[32rem] grid-cols-4 grid-rows-4 gap-3">
      {photos.map((photo, index) => (
        <motion.div
          key={photo.src}
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, delay: index * REVEAL_STEP, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-2xl"
          style={{ gridColumn: photo.col, gridRow: photo.row } as CSSProperties}
        >
          <Image
            src={photo.src}
            alt={photo.alt}
            fill
            sizes="(max-width: 1024px) 40vw, 18vw"
            className="object-cover"
          />
        </motion.div>
      ))}
    </div>
  );
}
