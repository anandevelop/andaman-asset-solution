/**
 * tests/lib/heading-anchors.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The one thing worth getting wrong here is silently: a Thai/Chinese/
 * Russian heading producing an empty or colliding id, since
 * lib/slugify.ts's ASCII-only slugify() would do exactly that (see this
 * file's own header for why it isn't reused). Also covers idempotency,
 * since render-time sanitization runs the pipeline more than once.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { addHeadingAnchors } from "@/lib/heading-anchors";

describe("addHeadingAnchors", () => {
  it("adds a slugified id to an English heading", () => {
    expect(addHeadingAnchors("<h2>Why Buyers Choose Phuket</h2>")).toBe(
      '<h2 id="why-buyers-choose-phuket">Why Buyers Choose Phuket</h2>',
    );
  });

  it("keeps Unicode scripts, unlike lib/slugify.ts's ASCII-only slugify()", () => {
    const html = "<h2>ทำไมนักลงทุนเลือกภูเก็ต</h2>";
    const result = addHeadingAnchors(html);
    expect(result).toContain('id="ทำไมนักลงทุนเลือกภูเก็ต"');
  });

  it("suffixes a colliding id with -2, -3, in order of appearance", () => {
    const html = "<h2>Overview</h2><h2>Overview</h2><h2>Overview</h2>";
    const result = addHeadingAnchors(html);
    expect(result).toBe(
      '<h2 id="overview">Overview</h2><h2 id="overview-2">Overview</h2><h2 id="overview-3">Overview</h2>',
    );
  });

  it("handles every heading level, 1 through 6", () => {
    const html = "<h1>A</h1><h3>B</h3><h6>C</h6>";
    const result = addHeadingAnchors(html);
    expect(result).toBe('<h1 id="a">A</h1><h3 id="b">B</h3><h6 id="c">C</h6>');
  });

  it("falls back to \"section\" for a heading with no extractable text", () => {
    expect(addHeadingAnchors('<h2><img src="/x.webp" alt=""></h2>')).toContain('id="section"');
  });

  it("replaces an existing id rather than adding a second one", () => {
    const result = addHeadingAnchors('<h2 id="stale">Fresh Text</h2>');
    expect(result).toBe('<h2 id="fresh-text">Fresh Text</h2>');
  });

  it("is idempotent — running it twice produces the same result", () => {
    const once = addHeadingAnchors("<h2>Overview</h2><h2>Overview</h2>");
    const twice = addHeadingAnchors(once);
    expect(twice).toBe(once);
  });

  it("preserves other attributes already on the tag", () => {
    const result = addHeadingAnchors('<h2 class="x" data-foo="bar">Title</h2>');
    expect(result).toBe('<h2 class="x" data-foo="bar" id="title">Title</h2>');
  });

  it("leaves content with no headings untouched", () => {
    expect(addHeadingAnchors("<p>No headings here.</p>")).toBe("<p>No headings here.</p>");
  });
});
