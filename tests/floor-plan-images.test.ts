/**
 * tests/floor-plan-images.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The line-drawing → blueprint transform.
 *
 * Run against real pixels through real sharp, not a mock. The whole point of
 * this module is what libvips does to a buffer, and the one bug it has
 * already had was libvips disagreeing with the arithmetic: `.negate()`
 * followed by a gain above 1 returns 0 for mid-tones instead of clamping to
 * 255. Pure black still came through, so a mocked or endpoint-only test
 * would have called that transform working while every anti-aliased edge in
 * every plan had silently vanished.
 *
 * Mid-tones are therefore asserted as carefully as the extremes.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  ASPECT_TOLERANCE,
  alphaMask,
  aspectMatches,
  blueprintFromBuffer,
  blueprintKeyFor,
} from "@/lib/floor-plan-images";

/** A 1-pixel-high strip of the given greys, as a PNG. */
async function strip(greys: number[]): Promise<Buffer> {
  const raw = Buffer.from(greys.flatMap((g) => [g, g, g]));
  return sharp(raw, { raw: { width: greys.length, height: 1, channels: 3 } })
    .png()
    .toBuffer();
}

/** Every channel of the decoded image, as [r,g,b,a] tuples. */
async function rgba(webp: Buffer): Promise<number[][]> {
  const { data, info } = await sharp(webp)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out: number[][] = [];
  for (let i = 0; i < data.length; i += info.channels) {
    out.push([...data.subarray(i, i + info.channels)]);
  }
  return out;
}

describe("alphaMask", () => {
  it("drops white paper to fully transparent", async () => {
    const mask = await alphaMask(sharp(await strip([255]))).raw().toBuffer();
    expect([...mask]).toEqual([0]);
  });

  it("brings black strokes through at full opacity", async () => {
    const mask = await alphaMask(sharp(await strip([0]))).raw().toBuffer();
    expect([...mask]).toEqual([255]);
  });

  /*
    The regression test. (255 - 128) * 2.1 = 266.7, which must clamp to 255 —
    the spelling this replaced returned 0 here, and 0 for a mid grey is an
    anti-aliased edge that has disappeared.
  */
  it("clamps a mid grey to opaque rather than wrapping to transparent", async () => {
    const mask = await alphaMask(sharp(await strip([128]))).raw().toBuffer();
    expect([...mask]).toEqual([255]);
  });

  it("keeps a near-white grey faintly visible instead of dropping it", async () => {
    const mask = await alphaMask(sharp(await strip([230]))).raw().toBuffer();

    // (255 - 230) * 2.1 = 52.5
    expect(mask[0]).toBeGreaterThan(0);
    expect(mask[0]).toBeLessThan(255);
  });

  it("is monotonic — darker paper never becomes more transparent", async () => {
    const mask = await alphaMask(sharp(await strip([255, 230, 180, 128, 60, 0])))
      .raw()
      .toBuffer();

    const values = [...mask];
    const ascending = [...values].sort((a, b) => a - b);
    expect(values).toEqual(ascending);
  });
});

describe("blueprintFromBuffer", () => {
  it("paints every stroke the one blueprint colour, whatever grey it was", async () => {
    const pixels = await rgba((await blueprintFromBuffer(await strip([0, 60, 128]))).webp);

    for (const [r, g, b] of pixels) {
      expect({ r, g, b }).toEqual({ r: 215, g: 229, b: 238 });
    }
  });

  it("keeps the drawing's dimensions", async () => {
    const source = await sharp({
      create: { width: 40, height: 15, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const { width, height } = await blueprintFromBuffer(source);
    expect({ width, height }).toEqual({ width: 40, height: 15 });
  });

  it("produces a real alpha channel, not an opaque rectangle", async () => {
    // The failure mode the whole module exists to avoid: a plan that renders
    // as a filled block over the navy shaft.
    const pixels = await rgba((await blueprintFromBuffer(await strip([255, 255, 0]))).webp);

    expect(pixels.map((p) => p[3])).toEqual([0, 0, 255]);
  });

  it("rejects a buffer that is not a readable image", async () => {
    await expect(blueprintFromBuffer(Buffer.from("not an image"))).rejects.toThrow();
  });
});

describe("blueprintKeyFor", () => {
  it("writes beside the original, not over it", () => {
    expect(blueprintKeyFor("projects/victory/abc.webp")).toBe(
      "projects/victory/abc-blueprint.webp",
    );
  });

  it("replaces whatever extension the original had", () => {
    expect(blueprintKeyFor("projects/x/plan.PNG")).toBe("projects/x/plan-blueprint.webp");
  });

  it("does not mistake a dot in a folder name for an extension", () => {
    expect(blueprintKeyFor("projects/v1.2/plan")).toBe("projects/v1.2/plan-blueprint.webp");
  });

  it("is stable, so regenerating overwrites instead of orphaning", () => {
    const key = "projects/victory/abc.webp";
    expect(blueprintKeyFor(key)).toBe(blueprintKeyFor(key));
  });
});

describe("aspectMatches", () => {
  const line = { width: 1800, height: 640 };

  it("accepts the same crop", () => {
    expect(aspectMatches(line, { width: 900, height: 320 })).toBe(true);
  });

  it("accepts a difference under the tolerance", () => {
    const height = Math.round(320 * (1 + ASPECT_TOLERANCE / 2));
    expect(aspectMatches(line, { width: 900, height })).toBe(true);
  });

  it("rejects a crop far enough off to move the pins", () => {
    expect(aspectMatches(line, { width: 900, height: 400 })).toBe(false);
  });

  it("does not divide by zero on an unreadable image", () => {
    expect(aspectMatches(line, { width: 0, height: 0 })).toBe(false);
    expect(aspectMatches({ width: 0, height: 0 }, line)).toBe(false);
  });
});
