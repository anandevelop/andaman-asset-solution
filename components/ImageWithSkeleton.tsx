"use client";

/**
 * components/ImageWithSkeleton.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Drop-in replacement for a `fill` next/image at any section/heading photo
 * site-wide — shows an animated shimmer skeleton (see `.skeleton-shimmer`
 * in app/globals.css) on top of the image until it finishes loading,
 * instead of a static blank box that gives no sign anything is happening.
 *
 * The real <Image> is rendered completely untouched (same props, same
 * className) — the skeleton is a separate absolutely-positioned sibling
 * layered on top, which fades out on load. That's deliberate: bolting an
 * opacity transition onto the Image's own className would collide with any
 * transition-property class that image already carries (several call
 * sites use `transition-transform ... group-hover:scale-105` for a
 * hover-zoom) — two transition-property utilities on one element don't
 * compose, only one wins, and it depends on stylesheet order rather than
 * anything obvious at the call site. Keeping the skeleton on its own
 * element sidesteps that entirely.
 *
 * Usage is identical to `<Image fill .../>`, and it must sit inside the
 * same `relative` (usually `overflow-hidden`, rounded) wrapper the fill
 * Image already required — that wrapper's own clipping/rounding covers the
 * skeleton for free, no extra classes needed here.
 *
 * `skeletonClassName` is an escape hatch for the rare call site that gives
 * its Image its own stacking position (e.g. VisionMission's `-z-20`
 * atmospheric backdrop, sandwiched under a gradient wash that assumes it
 * sits directly above the image) — pass the same z-index there so the
 * skeleton stays in the same slot instead of popping above layers that are
 * deliberately painted over the image.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, type ComponentProps } from "react";
import Image from "next/image";

type Props = ComponentProps<typeof Image> & { skeletonClassName?: string };

export default function ImageWithSkeleton({
  alt,
  onLoad,
  skeletonClassName = "",
  ...props
}: Props) {
  const [loaded, setLoaded] = useState(false);

  return (
    <>
      <Image
        {...props}
        alt={alt}
        onLoad={(event) => {
          setLoaded(true);
          onLoad?.(event);
        }}
      />
      <div
        aria-hidden
        className={`skeleton-shimmer pointer-events-none absolute inset-0 transition-opacity duration-500 ${skeletonClassName} ${
          loaded ? "opacity-0" : "opacity-100"
        }`}
      />
    </>
  );
}
