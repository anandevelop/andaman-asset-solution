/**
 * lib/pdf-render.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The arithmetic behind the e-brochure viewer, separated from the pdf.js
 * calls that use it.
 *
 * Not "server-only" — this runs in the browser. It is a separate module
 * from the hook that renders pages because these two functions are where
 * the decisions live (how big a page bitmap should be, which pages are
 * worth holding in memory), and they are worth testing without a DOM, a
 * canvas or a PDF.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Where the copied pdf.js assets live.
 *
 * Same-origin, and deliberately not processed by the bundler — see
 * scripts/copy-pdfjs-assets.mjs for why both the library and its worker
 * are served from public/ rather than imported from node_modules.
 *
 * No version segment: the library itself is imported from this path, so
 * there is nothing to read a version from before the import has happened.
 * Next serves public/ with must-revalidate, and the directory is rewritten
 * on every install and build, so a stale file is not a risk.
 */
export const PDFJS_ASSET_BASE = "/pdfjs";

/** The library and the worker, as the browser will ask for them. */
export const PDFJS_LIBRARY_URL = `${PDFJS_ASSET_BASE}/pdf.min.mjs`;
export const PDFJS_WORKER_URL = `${PDFJS_ASSET_BASE}/pdf.worker.min.mjs`;

export type RenderScaleArgs = {
  /** Page width at scale 1, from pdf.js's own viewport. */
  pdfWidth: number;
  pdfHeight: number;
  /** How wide the page will actually be drawn, in CSS pixels. */
  cssWidth: number;
  devicePixelRatio: number;
  /** Upper bound on the canvas, in pixels. */
  maxPixels: number;
};

/**
 * How much to scale a PDF page when rasterising it.
 *
 * Two caps, for two different reasons:
 *
 *   DPR is capped at 2. A 3x phone gains nothing visible from a third of
 *   the pixels again on a page that is mostly photography, and it costs
 *   2.25x the memory and decode time of a 2x render.
 *
 *   Total pixels are capped outright. iOS Safari refuses to allocate a
 *   canvas beyond roughly 16.7M pixels and older devices cap a single side
 *   at 4096 — but the practical reason to stay well under both is memory:
 *   an RGBA bitmap is 4 bytes a pixel, so a 4M-pixel page is 16MB live
 *   while it is being drawn. A tall A3 spread at full DPR would sail past
 *   that without this.
 *
 * Scaling by sqrt keeps the aspect ratio: pixels grow with the square of
 * the scale, so the correction has to be the square root of the overshoot.
 */
export function computeRenderScale({
  pdfWidth,
  pdfHeight,
  cssWidth,
  devicePixelRatio,
  maxPixels,
}: RenderScaleArgs): number {
  if (pdfWidth <= 0 || pdfHeight <= 0 || cssWidth <= 0) return 1;

  const dpr = Math.min(Math.max(devicePixelRatio, 1), 2);
  const scale = (cssWidth * dpr) / pdfWidth;
  const pixels = pdfWidth * scale * pdfHeight * scale;

  if (pixels <= maxPixels) return scale;

  return scale * Math.sqrt(maxPixels / pixels);
}

/**
 * Which page indices to keep rendered around the current position.
 *
 * Rendering every page of a 40-page brochure up front would mean 40
 * rasterisations and 40 live blobs before the first flip. Rendering only
 * the visible pair would mean a blank page every time someone turns one.
 * So: the current spread, plus one spread either side, which is what a
 * flip can reach before the next render finishes.
 *
 * Indices are 0-based and clamped, never wrapped — page 1 of a brochure is
 * not adjacent to its back cover, and a viewer that quietly rendered the
 * last page when asked for the one before the first would be hiding a bug.
 */
export function spreadWindow(
  currentIndex: number,
  pageCount: number,
  isSpread: boolean,
  radius = 1,
): number[] {
  if (pageCount <= 0) return [];

  const perSpread = isSpread ? 2 : 1;
  const clamped = Math.min(Math.max(currentIndex, 0), pageCount - 1);

  // Snap to the start of the spread the current page belongs to, so the
  // window is symmetrical around the pair rather than around whichever
  // half happens to be current.
  const spreadStart = Math.floor(clamped / perSpread) * perSpread;

  const first = spreadStart - radius * perSpread;
  const last = spreadStart + perSpread - 1 + radius * perSpread;

  const indices: number[] = [];
  for (let i = Math.max(first, 0); i <= Math.min(last, pageCount - 1); i += 1) {
    indices.push(i);
  }

  /*
    The cover is always resident. It is the first thing a visitor sees, the
    thing they come back to when they jump to the start, and the only page
    the index card and the OG image would ever want — re-rasterising it on
    every return is work with no upside.
  */
  if (!indices.includes(0)) indices.unshift(0);

  return indices;
}
