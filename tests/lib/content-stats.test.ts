/**
 * tests/lib/content-stats.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * getContentStats() feeds the live editor panel on every keystroke — a
 * wrong count here is a wrong SEO score, silently, since nothing else
 * cross-checks it. Covers Thai and English word counting separately
 * because they use different formulas, plus emoji (which must not be
 * miscounted as a Latin "word" or crash the Thai-character count), and
 * both storage formats (Markdown source vs. sanitized HTML — see
 * schema.prisma's ArticleFormat) since the rich-text editor introduced a
 * second shape this function has to read correctly.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { extractCheckableLinks, getContentStats, getPlainText } from "@/lib/content-stats";

describe("getContentStats — word count (Markdown)", () => {
  it("counts Latin words directly", () => {
    expect(getContentStats("one two three four five").wordCount).toBe(5);
  });

  it("approximates Thai words at 4.2 characters each", () => {
    const thai = "ภูเก็ต".repeat(10); // 60 Thai characters
    expect(getContentStats(thai).wordCount).toBe(Math.round(60 / 4.2));
  });

  it("mixes Thai and English in the same count", () => {
    const text = "สวัสดี hello world"; // 6 Thai chars + 2 Latin words
    expect(getContentStats(text).wordCount).toBe(Math.round(6 / 4.2) + 2);
  });

  it("does not count emoji as a Latin word, and does not crash on one", () => {
    expect(getContentStats("Great villa 🏡 for sale").wordCount).toBe(4);
    expect(() => getContentStats("สวัสดี 😊 hello")).not.toThrow();
  });

  it("returns zero for empty or null content", () => {
    expect(getContentStats("").wordCount).toBe(0);
    expect(getContentStats(null).wordCount).toBe(0);
    expect(getContentStats(undefined).wordCount).toBe(0);
  });
});

describe("getContentStats — word count (HTML)", () => {
  it("strips tags before counting", () => {
    const html = "<p>one <strong>two</strong> three</p><p>four five</p>";
    expect(getContentStats(html, "HTML").wordCount).toBe(5);
  });

  it("mixes Thai and English the same way HTML or not", () => {
    const html = "<p>สวัสดี hello world</p>";
    expect(getContentStats(html, "HTML").wordCount).toBe(Math.round(6 / 4.2) + 2);
  });
});

describe("getContentStats — paragraphs", () => {
  it("counts blank-line-separated blocks, excluding headings (Markdown)", () => {
    const markdown = "## Heading\n\nFirst paragraph.\n\nSecond paragraph.";
    expect(getContentStats(markdown).paragraphCount).toBe(2);
  });

  it("ignores blank content", () => {
    expect(getContentStats("\n\n\n").paragraphCount).toBe(0);
  });

  it("counts <p> tags (HTML)", () => {
    const html = "<h2>Heading</h2><p>First.</p><p>Second.</p>";
    expect(getContentStats(html, "HTML").paragraphCount).toBe(2);
  });

  it("ignores an empty <p></p> (HTML)", () => {
    const html = "<p>Real paragraph.</p><p></p>";
    expect(getContentStats(html, "HTML").paragraphCount).toBe(1);
  });
});

describe("getContentStats — heading outline (Markdown)", () => {
  it("extracts every heading level 1–6, in order", () => {
    const markdown =
      "# Title\n\n## First section\n\n### A detail\n\n#### Deeper\n\n##### Deeper still\n\n###### Deepest\n\n## Second section";
    expect(getContentStats(markdown).headings.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: "Title" },
      { level: 2, text: "First section" },
      { level: 3, text: "A detail" },
      { level: 4, text: "Deeper" },
      { level: 5, text: "Deeper still" },
      { level: 6, text: "Deepest" },
      { level: 2, text: "Second section" },
    ]);
  });
});

describe("getContentStats — heading outline (HTML)", () => {
  it("extracts h1–h6 tags, stripping inner markup from the text", () => {
    const html = "<h1>Title</h1><h2>Section <em>one</em></h2><h3>Detail</h3>";
    expect(getContentStats(html, "HTML").headings.map(({ level, text }) => ({ level, text }))).toEqual([
      { level: 1, text: "Title" },
      { level: 2, text: "Section one" },
      { level: 3, text: "Detail" },
    ]);
  });
});

describe("getContentStats — heading skipsLevel", () => {
  it("flags a heading more than one level below the one before it", () => {
    const markdown = "## Section\n\n#### Too deep";
    const headings = getContentStats(markdown).headings;
    expect(headings[0].skipsLevel).toBe(false);
    expect(headings[1].skipsLevel).toBe(true);
  });

  it("does not flag a level-by-level descent", () => {
    const markdown = "## Section\n\n### Detail\n\n#### Sub-detail";
    expect(getContentStats(markdown).headings.every((h) => !h.skipsLevel)).toBe(true);
  });

  it("does not flag the first heading, regardless of its level", () => {
    const markdown = "#### Starts deep";
    expect(getContentStats(markdown).headings[0].skipsLevel).toBe(false);
  });

  it("does not flag a heading that goes back up or stays level", () => {
    const markdown = "### Detail\n\n## Back up\n\n## Same level";
    const headings = getContentStats(markdown).headings;
    expect(headings[1].skipsLevel).toBe(false); // H3 → H2: going back up
    expect(headings[2].skipsLevel).toBe(false); // H2 → H2: same level
  });
});

describe("getContentStats — links and images", () => {
  it("counts images separately from links (Markdown)", () => {
    const markdown = "![Pool](/img/pool.webp) See [our villas](/projects/x) and [more](https://example.com).";
    const stats = getContentStats(markdown);
    expect(stats.imageCount).toBe(1);
    expect(stats.internalLinkCount).toBe(1);
    expect(stats.externalLinkCount).toBe(1);
  });

  it("counts images separately from links (HTML)", () => {
    const html = '<img src="/img/pool.webp" alt=""><a href="/projects/x">villas</a><a href="https://example.com">more</a>';
    const stats = getContentStats(html, "HTML");
    expect(stats.imageCount).toBe(1);
    expect(stats.internalLinkCount).toBe(1);
    expect(stats.externalLinkCount).toBe(1);
  });

  it("excludes anchors, mailto and tel from both link counts", () => {
    const markdown = "[jump](#gallery) [email](mailto:sales@example.com) [call](tel:+66123456789)";
    const stats = getContentStats(markdown);
    expect(stats.internalLinkCount).toBe(0);
    expect(stats.externalLinkCount).toBe(0);
  });
});

describe("extractCheckableLinks", () => {
  it("lists checkable links with internal/external flagged, excluding images", () => {
    const markdown = "![Pool](/img/pool.webp) See [our villas](/projects/x) and [more](https://example.com).";
    expect(extractCheckableLinks(markdown)).toEqual([
      { target: "/projects/x", internal: true },
      { target: "https://example.com", internal: false },
    ]);
  });

  it("reads HTML links the same way getContentStats does", () => {
    const html = '<a href="/projects/x">villas</a><a href="https://example.com">more</a>';
    expect(extractCheckableLinks(html)).toEqual([
      { target: "/projects/x", internal: true },
      { target: "https://example.com", internal: false },
    ]);
  });

  it("excludes anchors, mailto and tel", () => {
    const markdown = "[jump](#gallery) [email](mailto:sales@example.com) [call](tel:+66123456789)";
    expect(extractCheckableLinks(markdown)).toEqual([]);
  });

  it("returns an empty list for blank content", () => {
    expect(extractCheckableLinks("")).toEqual([]);
    expect(extractCheckableLinks(null)).toEqual([]);
  });
});

describe("getContentStats — average sentence length", () => {
  it("returns 0 when there is no measurable sentence", () => {
    expect(getContentStats("").averageSentenceLength).toBe(0);
    expect(getContentStats("Hi.").averageSentenceLength).toBe(0);
  });

  it("divides word count by sentence count", () => {
    const markdown = "This sentence has exactly six words. This one also has six words.";
    expect(getContentStats(markdown).averageSentenceLength).toBe(6);
  });
});

describe("getContentStats — reading minutes", () => {
  it("delegates to lib/markdown-text's readingMinutes (Markdown)", () => {
    expect(getContentStats("").readingMinutes).toBe(0);
    expect(getContentStats("word ".repeat(50)).readingMinutes).toBeGreaterThanOrEqual(1);
  });

  it("strips tags before computing reading time (HTML)", () => {
    expect(getContentStats("<p></p>", "HTML").readingMinutes).toBe(0);
    expect(getContentStats(`<p>${"word ".repeat(50)}</p>`, "HTML").readingMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe("getPlainText", () => {
  it("strips Markdown syntax", () => {
    expect(getPlainText("**bold** and [a link](/x)")).toBe("bold and a link");
  });

  it("strips HTML tags", () => {
    expect(getPlainText("<p><strong>bold</strong> and <a href=\"/x\">a link</a></p>", "HTML")).toBe(
      "bold and a link",
    );
  });

  it("returns an empty string for null/undefined/empty input", () => {
    expect(getPlainText(null)).toBe("");
    expect(getPlainText(undefined, "HTML")).toBe("");
    expect(getPlainText("")).toBe("");
  });
});
