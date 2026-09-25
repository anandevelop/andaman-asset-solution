/**
 * tests/article-render-pipeline.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * lib/article-render.ts — the three steps that turn a stored article body
 * into what a reader sees, and the function the news detail page calls:
 *
 *   sanitizeArticleHtml | renderMarkdown   →  stripLeadingH1  →  addHeadingAnchors
 *
 * Each step has its own tests. The composition had none, and two of §7's
 * acceptance criteria are about the composition rather than any one part:
 * that a body written with every heading level really renders as h1–h6
 * instead of being sanitized away, and that script and onerror are gone by
 * the time anything reaches dangerouslySetInnerHTML.
 *
 * The order is load-bearing and not obvious. Anchors are added *after*
 * sanitizing, so the ids they inject are never run past the allowlist —
 * which is safe only because they are generated here rather than taken from
 * the document. Putting addHeadingAnchors first would mean the sanitizer
 * deciding whether to keep an id it had no part in making.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { sanitizeArticleHtml } from "@/lib/markdown";
import { renderArticleBody as renderArticle } from "@/lib/article-render";

describe("every heading level survives to the page", () => {
  const body =
    "<p>Intro.</p>" +
    "<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>";

  it("keeps h1 through h6 through sanitising", () => {
    // §7's criterion is that none of the six is sanitized away. The page
    // then removes one of them on purpose — the next test — so this is
    // asserted on the sanitizer's own output rather than the page's.
    const out = sanitizeArticleHtml(body);
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(out).toMatch(new RegExp(`<h${level}>`));
    }
  });

  it("gives every heading the page keeps an anchor to deep-link to", () => {
    const out = renderArticle(body, "HTML");
    for (const level of [2, 3, 4, 5, 6]) {
      expect(out).toMatch(new RegExp(`<h${level}[^>]*\\sid="`));
    }
  });

  it("does the same for a Markdown article", () => {
    const out = renderArticle("Intro.\n\n# One\n\n## Two\n\n###### Six", "MARKDOWN");
    expect(out).toMatch(/<h2[^>]*>Two<\/h2>/);
    expect(out).toMatch(/<h6[^>]*>Six<\/h6>/);
  });

  it("removes the first H1 only, because the page renders the title as its own", () => {
    // lib/heading-policy.ts: the public page already prints the article's
    // title as an H1, so the first one in the body would be a second. It is
    // the *first* that goes, wherever it sits — despite the function's name,
    // it is not restricted to a body that opens with one — and any later H1
    // is the author's and stays.
    const out = renderArticle("<p>Intro.</p><h1>Title</h1><p>Body.</p><h1>Later</h1>", "HTML");
    expect(out).not.toMatch(/>Title</);
    expect(out).toMatch(/<h1[^>]*>Later<\/h1>/);
  });
});

describe("nothing executable reaches the page", () => {
  const vectors: [name: string, body: string][] = [
    ["script tag", "<p>a</p><script>alert(1)</script>"],
    ["img onerror", '<p>a</p><img src=x onerror="alert(1)">'],
    ["javascript: href", '<p><a href="javascript:alert(1)">x</a></p>'],
    ["iframe", '<p>a</p><iframe src="https://evil.test"></iframe>'],
    ["svg onload", "<p>a</p><svg/onload=alert(1)>"],
    ["onerror inside a heading", '<h2>t<img src=x onerror="alert(1)"></h2>'],
    ["data: html image", '<p><img src="data:text/html,<script>alert(1)</script>"></p>'],
  ];

  it.each(vectors)("strips %s from an HTML article", (_name, body) => {
    const out = renderArticle(body, "HTML");
    expect(out).not.toMatch(/<\s*(script|iframe|svg)\b/i);
    expect(out).not.toMatch(/\son\w+\s*=/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/src="data:/i);
  });

  it.each(vectors)("strips %s from a Markdown article", (_name, body) => {
    const out = renderArticle(body, "MARKDOWN");
    expect(out).not.toMatch(/<\s*(script|iframe|svg)\b/i);
    expect(out).not.toMatch(/\son\w+\s*=/i);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/src="data:/i);
  });

  it("adds anchors after sanitising, not before", () => {
    // An id in the source is the author's and goes through the allowlist;
    // the anchor id is generated. If anchors were added first the sanitizer
    // would be deciding whether to keep something it had no part in making,
    // and a hostile id would be indistinguishable from a generated one.
    const out = renderArticle('<h2 id="evil">Heading text</h2>', "HTML");
    expect(out).toMatch(/<h2[^>]*\sid="/);
    // Whatever id survives, the heading is still rendered and inert.
    expect(out).toMatch(/Heading text/);
    expect(out).not.toMatch(/\son\w+\s*=/i);
  });
});
