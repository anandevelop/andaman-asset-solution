/**
 * tests/warm-images.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The image warm-up (scripts/warm-images.mjs) finds what it should request.
 * It runs unattended in the cron container, so a parser that quietly finds
 * nothing would look exactly like a warm-up that worked.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { imageUrlsIn, pathsIn } from "../scripts/warm-images.mjs";

describe("imageUrlsIn", () => {
  it("collects src and every srcset width, unescaping &amp;", () => {
    const html = `<img src="/_next/image?url=%2Fa.webp&amp;w=2048&amp;q=75"
      srcset="/_next/image?url=%2Fa.webp&amp;w=640&amp;q=75 640w, /_next/image?url=%2Fa.webp&amp;w=1080&amp;q=75 1080w">`;
    expect(imageUrlsIn(html).sort()).toEqual([
      "/_next/image?url=%2Fa.webp&w=1080&q=75",
      "/_next/image?url=%2Fa.webp&w=2048&q=75",
      "/_next/image?url=%2Fa.webp&w=640&q=75",
    ]);
  });

  it("finds nothing in a page without optimized images", () => {
    expect(imageUrlsIn('<img src="https://cdn.example/x.jpg">')).toEqual([]);
  });
});

describe("pathsIn", () => {
  it("turns sitemap locations into paths on whatever host", () => {
    const xml = "<urlset><url><loc>https://example.com/th</loc></url><url><loc> https://example.com/en/projects/x </loc></url></urlset>";
    expect(pathsIn(xml)).toEqual(["/th", "/en/projects/x"]);
  });
});
