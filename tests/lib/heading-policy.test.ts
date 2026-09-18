/**
 * tests/lib/heading-policy.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * countH1s backs both the informational singleH1 checklist row
 * (lib/article-seo.ts) and the hard save-blocking gate (lib/validations.ts).
 * If this drifted from what those two actually see, an article could pass
 * the live checklist and still get rejected on save, or the reverse —
 * exactly the inconsistency this shared function exists to prevent.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { countH1s, stripLeadingH1 } from "@/lib/heading-policy";

describe("countH1s", () => {
  it("counts zero, one, and multiple H1s in Markdown", () => {
    expect(countH1s("## Just a section", "MARKDOWN")).toBe(0);
    expect(countH1s("# Title\n\n## Section", "MARKDOWN")).toBe(1);
    expect(countH1s("# One\n\n# Two", "MARKDOWN")).toBe(2);
  });

  it("counts H1s in HTML", () => {
    expect(countH1s("<h2>Section</h2>", "HTML")).toBe(0);
    expect(countH1s("<h1>Title</h1><h2>Section</h2>", "HTML")).toBe(1);
    expect(countH1s("<h1>One</h1><h1>Two</h1>", "HTML")).toBe(2);
  });

  it("returns 0 for null/undefined/empty content", () => {
    expect(countH1s(null, "HTML")).toBe(0);
    expect(countH1s(undefined, "MARKDOWN")).toBe(0);
    expect(countH1s("", "HTML")).toBe(0);
  });
});

describe("stripLeadingH1", () => {
  it("removes only the first H1", () => {
    const html = "<h1>First</h1><p>Body</p><h1>Second</h1>";
    expect(stripLeadingH1(html)).toBe("<p>Body</p><h1>Second</h1>");
  });

  it("leaves content with no H1 untouched", () => {
    expect(stripLeadingH1("<h2>Section</h2><p>Body</p>")).toBe("<h2>Section</h2><p>Body</p>");
  });

  it("removes an H1 with attributes", () => {
    expect(stripLeadingH1('<h1 id="title">Title</h1><p>Body</p>')).toBe("<p>Body</p>");
  });
});
