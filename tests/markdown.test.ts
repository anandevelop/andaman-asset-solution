/**
 * tests/markdown.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The article sanitizer.
 *
 * This is the highest-consequence pure function in the codebase: its output
 * goes straight into dangerouslySetInnerHTML on a public page. A regression
 * here is stored XSS on every visitor.
 *
 * Assertions check what can *execute*, not whether a substring appears.
 * "javascript:" surviving as inert text is fine; surviving inside an href
 * is not, and only the second is a vulnerability.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  markdownToText,
  readingMinutes,
  truncate,
} from "@/lib/markdown";

const SAFE_URI = /^(?:https?:|mailto:|tel:|#|\/)/i;

/** What actually matters: no dangerous URL, handler or tag survived. */
function audit(html: string) {
  const urls = [...html.matchAll(/(?:href|src)="([^"]*)"/gi)].map((m) => m[1]);

  return {
    unsafeUrls: urls.filter((url) => !SAFE_URI.test(url)),
    hasHandler: /\son\w+\s*=/i.test(html),
    hasExecutableTag:
      /<\s*(script|iframe|object|embed|form|style|link|meta|svg|base)\b/i.test(html),
  };
}

describe("renderMarkdown — hostile input", () => {
  const vectors: [name: string, markdown: string][] = [
    ["script tag", "<script>alert(1)</script>"],
    ["img onerror", '<img src=x onerror="alert(1)">'],
    ["markdown javascript: link", "[click](javascript:alert(1))"],
    ["mixed-case javascript: link", "[click](JaVaScRiPt:alert(1))"],
    ["raw anchor with javascript href", '<a href="javascript:alert(1)">x</a>'],
    ["vbscript href", '<a href="vbscript:msgbox(1)">x</a>'],
    ["markdown image with data: uri", "![i](data:text/html,<script>alert(1)</script>)"],
    [
      "raw img with base64 data: uri",
      '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
    ],
    ["data: svg with onload", '<img src="data:image/svg+xml,%3Csvg onload%3Dalert(1)%3E">'],
    ["iframe", '<iframe src="https://evil.test"></iframe>'],
    ["div onclick", '<div onclick="alert(1)">hi</div>'],
    ["svg onload", "<svg/onload=alert(1)>"],
    ["style tag", "<style>body{background:red}</style>"],
    ["form", '<form action="https://evil.test"></form>'],
    ["base tag", '<base href="https://evil.test/">'],
    ["protocol-relative image", '<img src="//evil.test/x.png">'],
    ["meta refresh", '<meta http-equiv="refresh" content="0;url=https://evil.test">'],
  ];

  it.each(vectors)("neutralises %s", (_name, markdown) => {
    const result = audit(renderMarkdown(markdown));

    expect(result.unsafeUrls).toEqual([]);
    expect(result.hasHandler).toBe(false);
    expect(result.hasExecutableTag).toBe(false);
  });

  it("strips the href but keeps the link text readable", () => {
    // A neutered link should still show its words — silently deleting an
    // editor's text would be its own kind of bug.
    const html = renderMarkdown('<a href="javascript:alert(1)">read this</a>');

    expect(html).toContain("read this");
    expect(html).not.toMatch(/href=/i);
  });
});

describe("renderMarkdown — legitimate content", () => {
  const source = [
    "## Heading",
    "",
    "**bold** and *italic* with [a link](https://example.com),",
    "[mail](mailto:sales@example.com) and [phone](tel:+6676123456)",
    "plus an [internal](/th/projects) one.",
    "",
    "- first",
    "- second",
    "",
    "> a quotation",
    "",
    "| a | b |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "`inline code`",
    "",
    "![villa](https://images.unsplash.com/photo.jpg)",
  ].join("\n");

  const html = renderMarkdown(source);

  it.each([
    ["headings", /<h2/],
    ["bold", /<strong>/],
    ["italic", /<em>/],
    ["lists", /<ul>/],
    ["blockquotes", /<blockquote>/],
    ["GFM tables", /<table>/],
    ["inline code", /<code>/],
    ["https links", /href="https:\/\/example\.com"/],
    ["mailto links", /href="mailto:sales@example\.com"/],
    ["tel links", /href="tel:\+6676123456"/],
    ["relative links", /href="\/th\/projects"/],
    ["https images", /src="https:\/\/images\.unsplash\.com\/photo\.jpg"/],
  ])("preserves %s", (_name, pattern) => {
    expect(html).toMatch(pattern);
  });

  it("adds noopener to external links only", () => {
    expect(html).toMatch(/href="https:\/\/example\.com" target="_blank" rel="noopener noreferrer"/);
    // A mailto: opening in a new tab is pointless and looks broken.
    expect(html).not.toMatch(/href="mailto:[^"]*" target/);
    expect(html).not.toMatch(/href="\/th\/projects" target/);
  });

  it("returns an empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown("   ")).toBe("");
    expect(renderMarkdown(null)).toBe("");
    expect(renderMarkdown(undefined)).toBe("");
  });
});

describe("markdownToText", () => {
  it("drops images and unwraps links", () => {
    const text = markdownToText("![alt](https://x.test/i.jpg) see [our villas](https://x.test)");

    expect(text).not.toContain("https://x.test");
    expect(text).toContain("our villas");
  });

  it("removes heading and emphasis syntax", () => {
    expect(markdownToText("## Title\n\n**bold** _em_ `code`")).toBe("Title bold em code");
  });
});

describe("readingMinutes", () => {
  it("is zero for empty content", () => {
    expect(readingMinutes("")).toBe(0);
    expect(readingMinutes(null)).toBe(0);
  });

  it("never rounds a short article down to zero", () => {
    expect(readingMinutes("A short note.")).toBe(1);
  });

  it("counts characters, so Thai is not under-measured", () => {
    // Thai has no inter-word spaces; a word-count approach would report
    // this 2,000-character article as roughly one word.
    const thai = "ก".repeat(2000);

    expect(readingMinutes(thai)).toBe(2);
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("short", 20)).toBe("short");
  });

  it("cuts on a word boundary and appends an ellipsis", () => {
    const source = "the quick brown fox jumps over the lazy dog";
    const result = truncate(source, 20);

    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(21);

    // "Word boundary" means the kept text is a prefix of the original and
    // the original continues with a space — not that it ends in a
    // non-letter, which a correct cut does anyway.
    const kept = result.slice(0, -1);

    expect(source.startsWith(kept)).toBe(true);
    expect(source[kept.length]).toBe(" ");
  });

  it("does not strand a single long word", () => {
    // No space to break on: the cut has to happen mid-word rather than
    // returning an ellipsis on its own.
    const result = truncate("a".repeat(100), 20);

    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeGreaterThan(10);
  });
});
