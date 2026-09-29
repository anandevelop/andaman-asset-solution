/**
 * lib/blueprint-pixels.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The line-drawing → blueprint transform as plain arithmetic, shared by the
 * server (lib/floor-plan-images.ts, through sharp) and the admin preview
 * (useDraftBlueprints, through a canvas).
 *
 * WHY THE PREVIEW NEEDS ITS OWN COPY OF THE TRANSFORM
 *
 * The stored blueprint is only written when a save succeeds. Until then a
 * freshly uploaded drawing exists only as the white-paper line image, and
 * that image on the navy shaft is a solid white rectangle — which is what the
 * preview used to show for every floor, because it was never handed the
 * blueprint at all. The preview draws its own from the same numbers so an
 * unsaved plan already looks the way it will once saved.
 *
 * Kept free of `server-only` and of sharp so a client component can import
 * it; the constants live here so the two paths cannot drift apart.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Flat colour every stroke is redrawn in — pale blue, for navy paper. */
export const BLUEPRINT_STROKE = { r: 215, g: 229, b: 238 } as const;

/** Contrast applied to the inverted luminance — see floor-plan-images.ts. */
export const BLUEPRINT_ALPHA_GAIN = 2.1;

/** Rec. 601 luma, the weighting libvips' greyscale uses. */
const luma = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/**
 * Rewrite RGBA pixels in place: every pixel becomes the stroke colour, with
 * alpha = clamp((255 − luminance) × gain, 0, 255). Existing transparency in
 * the source is respected (a transparent pixel stays transparent).
 */
export function blueprintPixels(data: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0; i < data.length; i += 4) {
    const ink = (255 - luma(data[i], data[i + 1], data[i + 2])) * BLUEPRINT_ALPHA_GAIN;
    const alpha = Math.min(255, Math.max(0, ink)) * (data[i + 3] / 255);
    data[i] = BLUEPRINT_STROKE.r;
    data[i + 1] = BLUEPRINT_STROKE.g;
    data[i + 2] = BLUEPRINT_STROKE.b;
    data[i + 3] = alpha;
  }
  return data;
}
