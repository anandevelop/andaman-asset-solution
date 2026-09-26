/**
 * tests/seo/fetch-rendered.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Reading the six things only the rendered page knows.
 *
 * Six of the fifteen rules depend entirely on this parsing, so a quiet
 * mistake here does not look like a parser bug — it looks like the site
 * failing an SEO rule, and somebody spends an afternoon on a page that was
 * fine. The JSON-LD shapes are the sharpest edge: this site emits an
 * object, an array (lib/article-schema.ts returns one) and a @graph, and a
 * parser that handled only the first would report "no structured data" on
 * every article.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { parseRendered } from "@/lib/seo/fetch-rendered";

const PAGE = `<!DOCTYPE html>
<html lang="th">
<head>
  <link rel="canonical" href="https://andamanassetsolution.com/th/projects/victory"/>
  <link rel="alternate" hrefLang="en" href="https://x.test/en/projects/victory"/>
  <link rel="alternate" hrefLang="th" href="https://x.test/th/projects/victory"/>
  <link rel="alternate" hreflang="ZH" href="https://x.test/zh/projects/victory"/>
  <link rel="alternate" hreflang="x-default" href="https://x.test/th/projects/victory"/>
  <meta name="robots" content="index, follow"/>
  <script type="application/ld+json">{"@type":"RealEstateListing","name":"Victory"}</script>
  <style>.a{content:"not words"}</style>
</head>
<body>
  <h1>The Victory</h1>
  <p>Eleven pool villas on the last ridge plot.</p>
  <img src="/a.jpg" alt="A villa">
  <img src="/b.jpg" alt="">
  <img src="/c.jpg">
  <script>console.log("also not words")</script>
</body>
</html>`;

describe("parseRendered", () => {
  it("reads the canonical", () => {
    expect(parseRendered(PAGE).canonical).toBe(
      "https://andamanassetsolution.com/th/projects/victory",
    );
  });

  it("reads every hreflang, lowercased, including x-default", () => {
    // Next writes the attribute as hrefLang in some places and hreflang in
    // others; both have to be found or the rule fails a correct page.
    expect(parseRendered(PAGE).hreflang.sort()).toEqual(["en", "th", "x-default", "zh"]);
  });

  it("counts H1s", () => {
    expect(parseRendered(PAGE).h1Count).toBe(1);
    expect(parseRendered("<h1>a</h1><h1 class='x'>b</h1>").h1Count).toBe(2);
    expect(parseRendered("<p>none</p>").h1Count).toBe(0);
  });

  it("reads the robots meta, lowercased", () => {
    expect(parseRendered('<meta name="robots" content="NOINDEX, NOFOLLOW">').metaRobots).toBe(
      "noindex, nofollow",
    );
  });

  it("returns null for a page with no canonical or robots meta", () => {
    const parsed = parseRendered("<html><body><p>bare</p></body></html>");
    expect(parsed.canonical).toBeNull();
    expect(parsed.metaRobots).toBeNull();
  });
});

describe("parseRendered — JSON-LD, in all three shapes this site emits", () => {
  it("reads a plain object", () => {
    expect(parseRendered(PAGE).jsonLdTypes).toEqual(["RealEstateListing"]);
  });

  it("reads an array — which is what an article with an FAQ emits", () => {
    const html =
      '<script type="application/ld+json">[{"@type":"NewsArticle"},{"@type":"FAQPage"}]</script>';
    expect(parseRendered(html).jsonLdTypes).toEqual(["NewsArticle", "FAQPage"]);
  });

  it("reads a @graph", () => {
    const html =
      '<script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":"BreadcrumbList"}]}</script>';
    expect(parseRendered(html).jsonLdTypes).toEqual(["Organization", "BreadcrumbList"]);
  });

  it("reads an array-valued @type", () => {
    const html = '<script type="application/ld+json">{"@type":["Organization","RealEstateAgent"]}</script>';
    expect(parseRendered(html).jsonLdTypes).toEqual(["Organization", "RealEstateAgent"]);
  });

  it("collects across several blocks", () => {
    const html =
      '<script type="application/ld+json">{"@type":"A"}</script>' +
      '<script type="application/ld+json">{"@type":"B"}</script>';
    expect(parseRendered(html).jsonLdTypes).toEqual(["A", "B"]);
  });

  it("skips a block that is not valid JSON rather than losing the page", () => {
    const html =
      '<script type="application/ld+json">{ broken</script>' +
      '<script type="application/ld+json">{"@type":"Event"}</script>';
    expect(parseRendered(html).jsonLdTypes).toEqual(["Event"]);
  });

  it("ignores a script that is not ld+json", () => {
    expect(parseRendered('<script>{"@type":"NotStructuredData"}</script>').jsonLdTypes).toEqual([]);
  });
});

describe("parseRendered — images", () => {
  it("counts images and the ones with no alt", () => {
    const parsed = parseRendered(PAGE);
    expect(parsed.imageCount).toBe(3);
    // An absent alt and an empty one are both missing: an empty alt on a
    // content image announces it as decoration, which is the same failure
    // for a screen reader. Marking it decorative is a different thing —
    // see below.
    expect(parsed.imagesMissingAlt).toBe(2);
  });

  it("ignores an image explicitly marked decorative", () => {
    // The finding that made this necessary: the language switcher's flag
    // is <img alt="" aria-hidden="true"> on every page of the site, and
    // counting it failed this rule on all 80 URLs. A rule that fails
    // everything is a rule people scroll past.
    const html =
      '<img src="/flag.svg" alt="" aria-hidden="true">' +
      '<img src="/deco.svg" alt="" role="presentation">' +
      '<img src="/real.jpg" alt="A villa">';

    const parsed = parseRendered(html);
    expect(parsed.imageCount).toBe(1);
    expect(parsed.imagesMissingAlt).toBe(0);
  });

  it("still counts a content image whose alt is empty", () => {
    // /contact's sales-team photographs, which are people and are not
    // decoration.
    const parsed = parseRendered('<img src="/person.jpg" alt="">');
    expect(parsed.imageCount).toBe(1);
    expect(parsed.imagesMissingAlt).toBe(1);
  });

  it("reports no images rather than zero-missing for a page with none", () => {
    expect(parseRendered("<p>text</p>").imageCount).toBe(0);
  });
});

describe("parseRendered — visible words", () => {
  it("counts body text", () => {
    expect(parseRendered("<p>one two three</p>").wordCount).toBe(3);
  });

  it("does not count script or style contents", () => {
    // A JSON-LD block is several hundred characters. Counting it would
    // make every page look substantial and the thin-content rule useless.
    const withoutScripts = parseRendered("<p>one two three</p>").wordCount;
    expect(parseRendered(PAGE).wordCount).toBeLessThan(20);
    expect(withoutScripts).toBe(3);
  });

  it("does not count tags or entities as words", () => {
    expect(parseRendered("<p><strong>one</strong>&nbsp;<em>two</em></p>").wordCount).toBe(2);
  });

  it("counts an empty document as zero rather than one", () => {
    expect(parseRendered("").wordCount).toBe(0);
    expect(parseRendered("<html><body></body></html>").wordCount).toBe(0);
  });
});
