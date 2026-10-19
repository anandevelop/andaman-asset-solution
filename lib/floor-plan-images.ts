import "server-only";

/**
 * lib/floor-plan-images.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Turning a floor plan's line drawing into the version the dark shaft can
 * draw, and reading the drawing's real size.
 *
 * WHY THE BLUEPRINT IS A FILE AND NOT A CSS FILTER
 *
 * The unit-types section is a deep navy blueprint frame, and the plans it
 * shows are black lines on white paper. `filter: invert()` with
 * `mix-blend-mode` is the obvious way to put one on the other, and it works
 * until the element also has a transform or a clip-path — which every floor
 * in the shaft has, because that is how the plan is drawn on and rotated for
 * portrait. Then the blend loses its backdrop and the plan renders as a
 * black rectangle. That was reproduced while building the mockup.
 *
 * So the transparent version is produced once, up front, and stored. It is
 * also smaller than the white-background original, and it lets the page
 * reserve the right box before the image arrives.
 *
 * THE TRANSFORM
 *
 *   alpha  = clamp((255 - luminance) * ALPHA_GAIN, 0, 255)
 *   colour = STROKE, flat
 *
 * Paper drops out, strokes come through at full opacity, and the greys in
 * between — which on a 1800px-wide drawing is every anti-aliased edge —
 * survive in proportion to how dark they were. The gain above 1 is what
 * stops thin grey lines fading to nothing once the paper is gone.
 * ─────────────────────────────────────────────────────────────────────────
 */

import sharp, { type Sharp } from "sharp";
import { objectKeyFromUrl, putS3Object, isS3Configured } from "@/lib/s3";
import { reportError } from "@/lib/sentry";
import { BLUEPRINT_ALPHA_GAIN, BLUEPRINT_STROKE } from "@/lib/blueprint-pixels";
import { siteConfig } from "@/config/site";
import { trustedImageUrl } from "@/lib/trusted-media";

/** Flat colour every stroke is redrawn in — pale blue, for navy paper.
 *  Shared with the admin preview's canvas copy of this transform. */
const STROKE = BLUEPRINT_STROKE;

/**
 * Contrast applied to the inverted luminance.
 *
 * 2.1 was chosen against the real Sale Kit drawings: at 1.0 the lighter
 * interior walls washed out against the navy, and above ~2.5 the paper's
 * own scanning noise started to show as a haze.
 */
const ALPHA_GAIN = BLUEPRINT_ALPHA_GAIN;

/** Anything this far apart in aspect ratio puts the room pins visibly off. */
export const ASPECT_TOLERANCE = 0.02;

export type DerivedBlueprint = {
  /** Public URL of the written object, or null when nothing was written. */
  blueprintUrl: string | null;
  width: number;
  height: number;
};

/**
 * The alpha-from-luminance mask, exported for its own test.
 *
 * Written as a single `linear()` rather than the obvious
 * `.negate().linear(GAIN, 0)`. Those are the same arithmetic, and the
 * obvious one is wrong: in sharp 0.35 / libvips 8.18, negate followed by a
 * gain above 1 returns 0 for mid-tones instead of clamping to 255, so every
 * anti-aliased edge — the thing this gain exists to keep — disappeared while
 * pure black still came through and the bug looked like a working transform.
 * Folding the inversion into the slope avoids the pair entirely:
 *
 *   -GAIN * x + 255 * GAIN  ≡  (255 - x) * GAIN
 */
export function alphaMask(image: Sharp): Sharp {
  return image.greyscale().linear(-ALPHA_GAIN, 255 * ALPHA_GAIN);
}

/** The transparent-stroke WebP for one line drawing, plus its size. */
export async function blueprintFromBuffer(
  source: Buffer,
): Promise<{ webp: Buffer; width: number; height: number }> {
  const { width, height } = await sharp(source).metadata();
  if (!width || !height) throw new Error("FLOOR_PLAN_UNREADABLE");

  /*
    Flattened onto white first. The Sale Kit PNGs are exported with a
    transparent background wherever the drawing has no paper — round the
    outside of an L-shaped plan, say — and a transparent pixel is stored as
    (0,0,0,0). greyscale() reads only the colour, so that "nothing" came out
    as black, i.e. full ink, and the whole empty area was painted as one
    solid pale-blue block on the public page. On white it is paper, and
    drops out like the rest; anti-aliased edges against transparency blend
    to the grey they would have been on paper.
  */
  const alpha = await alphaMask(sharp(source).flatten({ background: "#ffffff" })).raw().toBuffer();

  const webp = await sharp({
    create: { width, height, channels: 3, background: STROKE },
  })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .webp({ quality: 88 })
    .toBuffer();

  return { webp, width, height };
}

/**
 * `…/abc.webp` → `…/abc-blueprint.webp`, beside the original.
 *
 * With a version, `…/abc-blueprint-<version>.webp`. The plain key is
 * overwritten in place, which is right for a save (the drawing behind it
 * is new, and so is its URL), but wrong for regenerating a drawing that
 * has not changed: the object is served with max-age=86400 and the image
 * optimizer caches by URL, so the corrected file would sit behind the old
 * one for a day. A new key is a new URL, and nothing has it cached.
 */
export function blueprintKeyFor(key: string, version?: string): string {
  const base = key.replace(/\.[^./]+$/, "");
  return version ? `${base}-blueprint-${version}.webp` : `${base}-blueprint.webp`;
}

/** Only our own media, never via a redirect: see lib/trusted-media.ts. */
async function fetchImage(url: string): Promise<Buffer> {
  const target = trustedImageUrl(url, siteConfig.url);
  if (!target) throw new Error("FLOOR_PLAN_UNTRUSTED_URL");
  const response = await fetch(target, { cache: "no-store", redirect: "error" });
  if (!response.ok) throw new Error(`FLOOR_PLAN_FETCH_${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Derive and store the blueprint for a line drawing.
 *
 * Returns the drawing's dimensions even when no blueprint could be written,
 * because they are worth storing on their own — the page uses them to
 * reserve the box, and the section still renders against the plain line
 * drawing as a fallback. A missing blueprint degrades the look of one floor;
 * a thrown error here would fail the admin's save.
 *
 * Callers invoke this only when imageUrl actually changed. Deriving is a
 * download, a decode and an upload, and a floor whose label was corrected
 * has the same drawing it had before.
 */
export async function deriveBlueprint(
  lineUrl: string,
  options: { version?: string } = {},
): Promise<DerivedBlueprint> {
  const source = await fetchImage(lineUrl);
  const { webp, width, height } = await blueprintFromBuffer(source);

  const key = objectKeyFromUrl(lineUrl);

  /*
    Seeded plans live under public/ as static files and have no object key,
    and their blueprints ship alongside them in the kit. There is nowhere to
    write in that case — public/ is baked into the image — so the size is
    still reported and the blueprint is left to whatever the seed set.
  */
  if (!key || !isS3Configured()) return { blueprintUrl: null, width, height };

  try {
    const blueprintUrl = await putS3Object({
      key: blueprintKeyFor(key, options.version),
      body: webp,
      contentType: "image/webp",
    });
    return { blueprintUrl, width, height };
  } catch (error) {
    reportError(error, { tags: { scope: "deriveBlueprint" }, extra: { lineUrl } });
    return { blueprintUrl: null, width, height };
  }
}

/** Width and height of an image at a URL, without deriving anything. */
export async function readImageSize(
  url: string,
): Promise<{ width: number; height: number } | null> {
  try {
    const { width, height } = await sharp(await fetchImage(url)).metadata();
    return width && height ? { width, height } : null;
  } catch {
    return null;
  }
}

/**
 * Whether a furnished plan lines up with the line drawing it overlays.
 *
 * The room pins are stored once, against the line drawing, and painted over
 * whichever image is showing. A furnished render cropped even slightly
 * differently moves every label — subtly, so it reads as sloppy pinning
 * rather than as a mismatched file. Reported to the admin as a warning and
 * never a block: the Sale Kit crops are what they are, and a plan that is
 * slightly off is still more useful on screen than no furnished view at all.
 */
export function aspectMatches(
  line: { width: number; height: number },
  furnished: { width: number; height: number },
): boolean {
  if (line.height === 0 || furnished.height === 0) return false;

  const a = line.width / line.height;
  const b = furnished.width / furnished.height;

  return Math.abs(a - b) / a <= ASPECT_TOLERANCE;
}
