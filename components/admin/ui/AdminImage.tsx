"use client";

/**
 * components/admin/ui/AdminImage.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * An admin thumbnail that never shows the browser's broken-image icon.
 *
 * Media URLs are absolute and stored per row (lib/s3.ts), so an image can
 * outlive its file — a bucket cleaned up, a host retired. The project cards
 * showed exactly that: a torn-page glyph on a grey box where the photo
 * should be. With no URL, or once loading fails, this draws the v4
 * placeholder instead: the brand gradient with a faint ImageOff mark,
 * taking the same box (`className`) the image would have.
 *
 * Plain <img>, like every admin thumbnail — they are staff-only, small and
 * already sized by their uploads, so next/image's optimiser would only add
 * a remotePatterns entry per media host.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useState, type ImgHTMLAttributes } from "react";
import { ImageOff } from "lucide-react";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | null | undefined;
  /** The placeholder mark; 20px by default, as in the mockup. */
  iconSize?: number;
};

export default function AdminImage({ src, alt = "", className = "", iconSize = 20, ...rest }: Props) {
  const [failed, setFailed] = useState<string | null>(null);

  if (!src || failed === src) {
    return (
      <span
        aria-hidden={alt ? undefined : true}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        className={`flex items-center justify-center bg-linear-to-br from-adm-aurora-3 via-adm-aurora-1 via-60% to-adm-fill ${className}`}
      >
        <ImageOff size={iconSize} className="text-white/40" aria-hidden />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- see the note above
    <img
      ref={(node) => {
        // A server-rendered image can fail before hydration attaches
        // onError; a finished load with no pixels is that failure.
        if (node?.complete && node.naturalWidth === 0) setFailed(src);
      }}
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(src)}
      {...rest}
    />
  );
}
