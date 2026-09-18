/**
 * tests/pdf-render.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The two decisions in the e-brochure viewer that are arithmetic rather
 * than rendering: how large to rasterise a page, and which pages to keep.
 *
 * Both are the kind of thing that fails silently. A scale that is too high
 * does not throw — it allocates a bitmap the device refuses, or quietly
 * costs several seconds a page on a phone. A window that is off by one
 * shows a blank leaf mid-flip, which reads as a slow connection rather
 * than as a bug. Neither needs a DOM, a canvas or a PDF to test.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  computeRenderScale,
  PDFJS_ASSET_BASE,
  PDFJS_LIBRARY_URL,
  PDFJS_WORKER_URL,
  spreadWindow,
} from "@/lib/pdf-render";

/** A4 at 72dpi, which is what pdf.js reports for most brochures. */
const A4 = { pdfWidth: 595, pdfHeight: 842 };
const MAX_PIXELS = 4_000_000;

describe("computeRenderScale", () => {
  it("renders at the CSS width times the device pixel ratio", () => {
    const scale = computeRenderScale({
      ...A4,
      cssWidth: 595,
      devicePixelRatio: 2,
      maxPixels: MAX_PIXELS,
    });

    expect(scale).toBeCloseTo(2, 5);
  });

  it("caps the device pixel ratio at 2", () => {
    // A 3x phone gets the same bitmap as a 2x one. The pixels it would
    // gain are invisible on a photographic page and cost 2.25x the memory.
    const at2 = computeRenderScale({
      ...A4,
      cssWidth: 400,
      devicePixelRatio: 2,
      maxPixels: MAX_PIXELS,
    });
    const at3 = computeRenderScale({
      ...A4,
      cssWidth: 400,
      devicePixelRatio: 3,
      maxPixels: MAX_PIXELS,
    });

    expect(at3).toBe(at2);
  });

  it("treats a sub-1 pixel ratio as 1", () => {
    const scale = computeRenderScale({
      ...A4,
      cssWidth: 595,
      devicePixelRatio: 0.75,
      maxPixels: MAX_PIXELS,
    });

    expect(scale).toBeCloseTo(1, 5);
  });

  it("never exceeds the pixel budget, however wide the request", () => {
    const scale = computeRenderScale({
      ...A4,
      cssWidth: 4000,
      devicePixelRatio: 2,
      maxPixels: MAX_PIXELS,
    });

    const pixels = A4.pdfWidth * scale * A4.pdfHeight * scale;

    expect(pixels).toBeLessThanOrEqual(MAX_PIXELS + 1);
  });

  it("stays under the budget for a very tall page too", () => {
    // A folded A3 spread is the shape that would sail past the cap if the
    // correction only looked at width.
    const scale = computeRenderScale({
      pdfWidth: 1191,
      pdfHeight: 1684,
      cssWidth: 1400,
      devicePixelRatio: 2,
      maxPixels: MAX_PIXELS,
    });

    expect(1191 * scale * 1684 * scale).toBeLessThanOrEqual(MAX_PIXELS + 1);
  });

  it("keeps the aspect ratio when it clamps", () => {
    // One scale for both axes: a page squeezed on one side only would
    // render distorted, and nothing downstream would notice.
    const scale = computeRenderScale({
      ...A4,
      cssWidth: 4000,
      devicePixelRatio: 2,
      maxPixels: MAX_PIXELS,
    });

    const width = A4.pdfWidth * scale;
    const height = A4.pdfHeight * scale;

    expect(width / height).toBeCloseTo(A4.pdfWidth / A4.pdfHeight, 5);
  });

  it.each([
    ["zero width", { pdfWidth: 0 }],
    ["zero height", { pdfHeight: 0 }],
    ["zero css width", { cssWidth: 0 }],
  ])("falls back to 1 for %s rather than dividing by zero", (_label, override) => {
    const scale = computeRenderScale({
      ...A4,
      cssWidth: 595,
      devicePixelRatio: 2,
      maxPixels: MAX_PIXELS,
      ...override,
    });

    expect(scale).toBe(1);
  });
});

describe("spreadWindow", () => {
  it("returns nothing for an empty document", () => {
    expect(spreadWindow(0, 0, true)).toEqual([]);
  });

  it("keeps the current spread and one either side", () => {
    // 8 pages, spread mode, sitting on pages 4-5 (indices 4 and 5):
    // the pair behind, the current pair, the pair ahead.
    expect(spreadWindow(4, 8, true)).toEqual([0, 2, 3, 4, 5, 6, 7]);
  });

  it("is narrower in single-page mode than in spread mode", () => {
    const single = spreadWindow(10, 40, false);
    const spread = spreadWindow(10, 40, true);

    expect(single.length).toBeLessThan(spread.length);
  });

  it("clamps at the start instead of wrapping to the end", () => {
    // A viewer that rendered the back cover when asked for the page before
    // the first would be hiding an off-by-one, not handling it.
    const window = spreadWindow(0, 20, true);

    expect(Math.min(...window)).toBe(0);
    expect(window).not.toContain(19);
  });

  it("clamps at the end instead of wrapping to the start", () => {
    const window = spreadWindow(19, 20, true);

    expect(Math.max(...window)).toBe(19);
  });

  it.each([
    [0, 1, true],
    [5, 6, false],
    [39, 40, true],
    [-4, 12, true],
    [999, 12, false],
  ])("never returns an out-of-range index (%i of %i)", (index, count, isSpread) => {
    for (const page of spreadWindow(index, count, isSpread)) {
      expect(page).toBeGreaterThanOrEqual(0);
      expect(page).toBeLessThan(count);
    }
  });

  it("always keeps the cover resident", () => {
    // Page one is what a visitor returns to and what the index card wants.
    expect(spreadWindow(30, 40, true)).toContain(0);
  });

  it("returns no duplicates", () => {
    // The cover is unshifted separately, so page 0 could appear twice near
    // the start of the document.
    const window = spreadWindow(1, 40, true);

    expect(new Set(window).size).toBe(window.length);
  });

  it("widens with the radius", () => {
    expect(spreadWindow(10, 40, true, 2).length).toBeGreaterThan(
      spreadWindow(10, 40, true, 1).length,
    );
  });
});

describe("pdf.js asset URLs", () => {
  it.each([
    ["library", PDFJS_LIBRARY_URL],
    ["worker", PDFJS_WORKER_URL],
  ])("serves the %s from our own origin", (_label, url) => {
    /*
      Both have to be same-origin, for two different reasons. A
      cross-origin workerSrc makes pdf.js re-host the worker from a blob:,
      which worker-src 'self' refuses. And the library is imported with
      webpackIgnore, so an absolute URL to another host would be a live
      cross-origin script load. See scripts/copy-pdfjs-assets.mjs.
    */
    expect(url.startsWith("/")).toBe(true);
    expect(url).not.toMatch(/^https?:/);
  });

  it("keeps the library and the worker together", () => {
    // A worker from one version beside a library from another is a class
    // of bug with no useful error message.
    expect(PDFJS_LIBRARY_URL.startsWith(`${PDFJS_ASSET_BASE}/`)).toBe(true);
    expect(PDFJS_WORKER_URL.startsWith(`${PDFJS_ASSET_BASE}/`)).toBe(true);
  });
});
