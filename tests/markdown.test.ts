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
import { RICH_TEXT_TAGS, renderMarkdown, sanitizeArticleHtml } from "@/lib/markdown";
import { markdownToText, readingMinutes, truncate } from "@/lib/markdown-text";

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

  it("keeps h1/h5/h6 now that the rich-text editor can produce them", () => {
    const html = renderMarkdown("# Top\n\n##### Deep\n\n###### Deepest");
    expect(html).toMatch(/<h1>Top<\/h1>/);
    expect(html).toMatch(/<h5>Deep<\/h5>/);
    expect(html).toMatch(/<h6>Deepest<\/h6>/);
  });
});

describe("sanitizeArticleHtml — hostile input", () => {
  // Same vectors renderMarkdown's own suite runs, minus the Markdown-only
  // ones (a "javascript:" markdown link isn't a distinct code path here —
  // there's no marked.parse() step at all) — this function is a second,
  // independent entry point into the exact same DOMPurify call, and
  // deserves the same scrutiny renderMarkdown gets.
  const vectors: [name: string, html: string][] = [
    ["script tag", "<script>alert(1)</script>"],
    ["img onerror", '<img src=x onerror="alert(1)">'],
    ["raw anchor with javascript href", '<a href="javascript:alert(1)">x</a>'],
    ["vbscript href", '<a href="vbscript:msgbox(1)">x</a>'],
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
    ["meta refresh", '<meta http-equiv="refresh" content="0;url=https://evil.test">'],
  ];

  it.each(vectors)("neutralises %s", (_name, html) => {
    const result = audit(sanitizeArticleHtml(html));

    expect(result.unsafeUrls).toEqual([]);
    expect(result.hasHandler).toBe(false);
    expect(result.hasExecutableTag).toBe(false);
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeArticleHtml("")).toBe("");
    expect(sanitizeArticleHtml("   ")).toBe("");
    expect(sanitizeArticleHtml(null)).toBe("");
    expect(sanitizeArticleHtml(undefined)).toBe("");
  });
});

describe("sanitizeArticleHtml — legitimate content", () => {
  const source = [
    "<h1>Title</h1>",
    "<h2>Section</h2>",
    '<p>Body with <a href="/projects/x" data-internal="true">an internal link</a>',
    ' and <a href="https://example.com">an external one</a>.</p>',
    '<figure data-align="center"><img id="cover" src="https://images.unsplash.com/photo.jpg" alt="A villa" loading="lazy" data-media-id="m1"><figcaption>Caption</figcaption></figure>',
    "<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>",
  ].join("");

  const html = sanitizeArticleHtml(source);

  it.each([
    ["h1", /<h1>Title<\/h1>/],
    ["h2", /<h2>Section<\/h2>/],
    ["figure/figcaption", /<figure.*<figcaption>Caption<\/figcaption><\/figure>/],
    ["the id attribute", /id="cover"/],
    ["data-internal", /data-internal="true"/],
    ["data-media-id", /data-media-id="m1"/],
    ["data-align", /data-align="center"/],
    ["tables", /<table>/],
  ])("preserves %s", (_name, pattern) => {
    expect(html).toMatch(pattern);
  });

  it("does not run the content through a Markdown parser", () => {
    // "*not bold*" would become <em>not bold</em> if this accidentally
    // piped through marked.parse() first.
    expect(sanitizeArticleHtml("<p>*not bold*</p>")).toBe("<p>*not bold*</p>");
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

/*
  Every tag the rich-text editor can produce has to survive the sanitizer.

  This is the check that would have caught the underline/strike data loss:
  StarterKit enabled both regardless of the toolbar, so ⌘U and ⌘⇧X wrote
  <u> and <s> into the document, and sanitizeArticleHtml — whose allowlist
  had neither — quietly removed them on save. No error, no warning; the
  author simply watched their formatting evaporate and blamed the editor.

  Driven off lib/markdown.ts's own RICH_TEXT_TAGS rather than a list
  written out again here, because a second copy is precisely what drifts:
  the allowlist is built from that same export, so adding an extension to
  the editor without adding its tag fails here instead of in production.
*/
describe("every tag the rich-text editor emits survives sanitising", () => {
  /** Minimal, valid markup for one tag — enough to assert it is not
   *  stripped, without asserting anything about the rest of the document. */
  const SAMPLES: Record<(typeof RICH_TEXT_TAGS)[number], string> = {
    p: "<p>x</p>",
    br: "<p>a<br>b</p>",
    hr: "<p>a</p><hr><p>b</p>",
    h1: "<h1>x</h1>",
    h2: "<h2>x</h2>",
    h3: "<h3>x</h3>",
    h4: "<h4>x</h4>",
    h5: "<h5>x</h5>",
    h6: "<h6>x</h6>",
    strong: "<p><strong>x</strong></p>",
    em: "<p><em>x</em></p>",
    s: "<p><s>x</s></p>",
    ul: "<ul><li>x</li></ul>",
    ol: "<ol><li>x</li></ol>",
    li: "<ul><li>x</li></ul>",
    blockquote: "<blockquote><p>x</p></blockquote>",
    a: '<p><a href="/projects">x</a></p>',
    img: '<figure><img src="/a.jpg" alt="x"></figure>',
    figure: '<figure><img src="/a.jpg" alt="x"></figure>',
    figcaption: '<figure><img src="/a.jpg" alt="x"><figcaption>c</figcaption></figure>',
    code: "<p><code>x</code></p>",
    pre: "<pre><code>x</code></pre>",
    table: "<table><tbody><tr><td>x</td></tr></tbody></table>",
    thead: "<table><thead><tr><th>h</th></tr></thead></table>",
    tbody: "<table><tbody><tr><td>x</td></tr></tbody></table>",
    tr: "<table><tbody><tr><td>x</td></tr></tbody></table>",
    th: "<table><thead><tr><th>h</th></tr></thead></table>",
    td: "<table><tbody><tr><td>x</td></tr></tbody></table>",
  };

  it("covers every tag in RICH_TEXT_TAGS, with no sample left behind", () => {
    // A tag added to the export but not sampled here would otherwise pass
    // this suite by simply never being tested.
    expect(Object.keys(SAMPLES).sort()).toEqual([...RICH_TEXT_TAGS].sort());
  });

  for (const tag of RICH_TEXT_TAGS) {
    it(`keeps <${tag}>`, () => {
      const out = sanitizeArticleHtml(SAMPLES[tag]);
      expect(out).toContain(`<${tag}`);
    });
  }

  it("still keeps <del>, which older Markdown articles are written with", () => {
    // marked renders ~~x~~ as <del>, not <s>. Dropping it while adding <s>
    // would have strikethrough vanish from every pre-editor article.
    expect(sanitizeArticleHtml("<p><del>x</del></p>")).toContain("<del>");
    expect(renderMarkdown("~~x~~")).toContain("<del>");
  });
});

/*
  Merged table cells.

  colspan and rowspan sat in ALLOWED_ATTR for a long time doing nothing:
  DOMPurify runs ALLOWED_URI_REGEXP against every attribute that is neither
  data-* nor on its own URI-safe list, so `colspan="2"` was tested as a URL,
  failed, and was removed. Invisible while only Markdown made tables —
  marked never emits a merged cell — and a silent unmerge the moment the
  editor could.
*/
describe("table cells keep their spans", () => {
  it("keeps colspan and rowspan", () => {
    const out = sanitizeArticleHtml(
      '<table><tbody><tr><td colspan="2" rowspan="3">merged</td></tr></tbody></table>',
    );
    expect(out).toContain('colspan="2"');
    expect(out).toContain('rowspan="3"');
  });

  it("does not turn them into an execution route", () => {
    // They are exempt from the URL check because they are not URLs. A
    // browser parses colspan as a number and ignores anything else, so a
    // junk value is inert rather than dangerous — but the audit has to
    // agree, not just the reasoning.
    const out = sanitizeArticleHtml(
      '<table><tbody><tr><td colspan="javascript:alert(1)" onclick="alert(1)">x</td></tr></tbody></table>',
    );
    const report = audit(out);
    expect(report.hasHandler).toBe(false);
    expect(report.unsafeUrls).toEqual([]);
    expect(report.hasExecutableTag).toBe(false);
  });
});

describe("ready-made block markers survive sanitising", () => {
  it("keeps data-block and data-tone on a callout", () => {
    const out = sanitizeArticleHtml(
      '<blockquote data-block="callout" data-tone="warning"><p>x</p></blockquote>',
    );
    expect(out).toContain('data-block="callout"');
    expect(out).toContain('data-tone="warning"');
  });

  it("does not need them exempted from the URL check", () => {
    // Unlike colspan/rowspan, data-* attributes are exempt from
    // ALLOWED_URI_REGEXP by DOMPurify's own rules — asserted rather than
    // assumed, since that assumption is exactly what cost the table its
    // merged cells.
    expect(sanitizeArticleHtml('<blockquote data-block="callout" data-tone="note"><p>x</p></blockquote>'))
      .toContain('data-tone="note"');
  });

  it("keeps a pull quote whole, attribution included", () => {
    // The attribution is a <p data-block="quote-attribution"> rather than
    // the <cite> or <footer> it would be in ordinary HTML, precisely so
    // that neither ALLOWED_TAGS nor ALLOWED_ATTR has to grow for it.
    const out = sanitizeArticleHtml(
      '<blockquote data-block="pull-quote"><p>Quoted.</p>' +
        '<p data-block="quote-attribution">Someone</p></blockquote>',
    );
    expect(out).toContain('data-block="pull-quote"');
    expect(out).toContain('data-block="quote-attribution"');
    expect(out).toContain("Someone");
  });

  it("still refuses the div the blocks would otherwise have been", () => {
    // The whole reason these blocks are blockquotes and paragraphs. If
    // this ever passes, the allowlist has been widened and the blocks
    // should have been rewritten, not the sanitizer.
    const out = sanitizeArticleHtml('<div class="callout" style="color:red">x</div>');
    expect(out).not.toContain("<div");
    expect(out).not.toContain("class=");
    expect(out).not.toContain("style=");
  });
});
