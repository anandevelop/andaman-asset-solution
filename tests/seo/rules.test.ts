/**
 * tests/seo/rules.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Every on-page rule, from a fixture. No database, no network, no
 * environment — which is the whole reason a rule is `{ key, severity,
 * weight, check(input) }` and gets handed everything it needs.
 *
 * Each rule gets its pass, its fail, and — where it has one — its skip,
 * because "could not check" is a third outcome and scoring it as a pass is
 * how the pages nobody could fetch end up looking like the healthiest on
 * the site.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { SEO_RULES, SEO_RULE_KEYS, findRule } from "@/lib/seo/rules";
import type { RenderedPage, SeoRuleInput } from "@/lib/seo/types";
import { canonicalMatches } from "@/lib/seo/rules/canonical";
import { TITLE_MAX_LENGTH } from "@/lib/seo/rules/title-length";
import { THIN_CONTENT_MIN_WORDS } from "@/lib/seo/rules/thin-content";
import { SLUG_MAX_LENGTH } from "@/lib/seo/rules/slug-length";

/** A page that passes everything, so each test changes one thing. */
function rendered(overrides: Partial<RenderedPage> = {}): RenderedPage {
  return {
    canonical: "https://andamanassetsolution.com/th/projects/victory",
    hreflang: ["en", "th", "zh", "ru", "x-default"],
    h1Count: 1,
    jsonLdTypes: ["RealEstateListing"],
    metaRobots: "index, follow",
    imageCount: 4,
    imagesMissingAlt: 0,
    wordCount: 800,
    ...overrides,
  };
}

function input(overrides: Partial<SeoRuleInput> = {}): SeoRuleInput {
  return {
    url: "/th/projects/victory",
    locale: "th",
    slug: "victory",
    title: "The Victory — pool villas in Laguna",
    metaDescription: "Eleven pool villas on the last ridge plot in Laguna.",
    noIndex: false,
    ogImageUrl: "https://media.example.com/victory.jpg",
    localeCount: 4,
    siteLocaleCount: 4,
    duplicates: { title: 1, metaDescription: 1 },
    siteIndexable: true,
    rendered: rendered(),
    brokenInternalLinks: 0,
    ...overrides,
  };
}

/** Run one rule by key. */
function run(key: string, overrides: Partial<SeoRuleInput> = {}) {
  const rule = findRule(key);
  if (!rule) throw new Error(`no rule ${key}`);
  return rule.check(input(overrides));
}

describe("the rule set as a whole", () => {
  it("weights sum to exactly 100", () => {
    // What lets score.ts subtract from 100 with no normalising step, and
    // what makes raising one weight a decision to lower another.
    expect(SEO_RULES.reduce((total, rule) => total + rule.weight, 0)).toBe(100);
  });

  it("has fifteen rules with unique keys", () => {
    expect(SEO_RULES).toHaveLength(15);
    expect(new Set(SEO_RULE_KEYS).size).toBe(15);
  });

  it("is ordered heaviest first, so the table's top row is the worst", () => {
    const weights = SEO_RULES.map((rule) => rule.weight);
    expect([...weights].sort((a, b) => b - a)).toEqual(weights);
  });

  it("passes every rule on a healthy page", () => {
    for (const rule of SEO_RULES) {
      expect(rule.check(input()).status, rule.key).toBe("pass");
    }
  });

  it("never throws on a page that could not be fetched", () => {
    for (const rule of SEO_RULES) {
      expect(() => rule.check(input({ rendered: null, brokenInternalLinks: null })), rule.key).not.toThrow();
    }
  });
});

describe("meta-description", () => {
  it("fails when empty", () => {
    expect(run("meta-description", { metaDescription: "" }).status).toBe("fail");
    expect(run("meta-description", { metaDescription: "   " }).status).toBe("fail");
  });
});

describe("hreflang", () => {
  it("fails when a locale is missing", () => {
    const result = run("hreflang", { rendered: rendered({ hreflang: ["en", "th"] }) });
    expect(result).toMatchObject({ status: "fail", detail: "2/4" });
  });

  it("does not count x-default toward the four", () => {
    const result = run("hreflang", { rendered: rendered({ hreflang: ["en", "th", "zh", "x-default"] }) });
    expect(result).toMatchObject({ status: "fail", detail: "3/4" });
  });

  it("is case-insensitive about the tag values", () => {
    expect(run("hreflang", { rendered: rendered({ hreflang: ["EN", "TH", "ZH", "RU"] }) }).status).toBe("pass");
  });

  it("skips when the page could not be fetched", () => {
    expect(run("hreflang", { rendered: null }).status).toBe("skip");
  });
});

describe("canonical", () => {
  it("passes when it points at this page", () => {
    expect(run("canonical").status).toBe("pass");
  });

  it("fails when it points somewhere else", () => {
    const result = run("canonical", {
      rendered: rendered({ canonical: "https://andamanassetsolution.com/th/projects/other" }),
    });
    expect(result.status).toBe("fail");
  });

  it("fails when absent, and says so", () => {
    const result = run("canonical", { rendered: rendered({ canonical: null }) });
    expect(result).toMatchObject({ status: "fail", detail: "missing" });
  });

  it("ignores a query string and a trailing slash", () => {
    expect(canonicalMatches("https://x.test/th/projects/victory/", "/th/projects/victory")).toBe(true);
    expect(canonicalMatches("https://x.test/th/projects/victory?utm=1", "/th/projects/victory")).toBe(true);
  });

  it("treats a malformed canonical as wrong rather than throwing", () => {
    expect(canonicalMatches("/th/projects/victory", "/th/projects/victory")).toBe(false);
  });
});

describe("unintended-noindex", () => {
  it("fails when the page renders noindex and nobody asked", () => {
    const result = run("unintended-noindex", {
      rendered: rendered({ metaRobots: "noindex, nofollow" }),
      noIndex: false,
    });
    expect(result.status).toBe("fail");
  });

  it("passes when the editor asked for it — that is a decision, not a defect", () => {
    const result = run("unintended-noindex", {
      rendered: rendered({ metaRobots: "noindex, follow" }),
      noIndex: true,
    });
    expect(result.status).toBe("pass");
  });

  it("skips on a deployment that is not indexable at all", () => {
    // Staging renders noindex on every page by design (lib/indexing.ts).
    // Without this the rule fails all 372 URLs there and means nothing.
    const result = run("unintended-noindex", {
      siteIndexable: false,
      rendered: rendered({ metaRobots: "noindex, nofollow" }),
    });
    expect(result.status).toBe("skip");
  });
});

describe("h1", () => {
  it.each([0, 2, 3])("fails on %i headings", (count) => {
    expect(run("h1", { rendered: rendered({ h1Count: count }) })).toMatchObject({
      status: "fail",
      detail: String(count),
    });
  });

  it("skips when the page could not be fetched", () => {
    expect(run("h1", { rendered: null }).status).toBe("skip");
  });
});

describe("duplicate-title", () => {
  it("fails when another page shares the title", () => {
    expect(run("duplicate-title", { duplicates: { title: 3, metaDescription: 1 } })).toMatchObject({
      status: "fail",
      detail: "3 pages",
    });
  });

  it("skips a page with no title rather than calling it a duplicate", () => {
    expect(run("duplicate-title", { title: "  ", duplicates: { title: 9, metaDescription: 1 } }).status).toBe("skip");
  });
});

describe("title-length", () => {
  it("passes at exactly the budget", () => {
    expect(run("title-length", { title: "a".repeat(TITLE_MAX_LENGTH) }).status).toBe("pass");
  });

  it("fails one character over, and says the length", () => {
    expect(run("title-length", { title: "a".repeat(TITLE_MAX_LENGTH + 1) })).toMatchObject({
      status: "fail",
      detail: String(TITLE_MAX_LENGTH + 1),
    });
  });

  it("skips an empty title — that is meta/title's problem, not length's", () => {
    expect(run("title-length", { title: "" }).status).toBe("skip");
  });
});

describe("json-ld", () => {
  it("fails when nothing was emitted", () => {
    expect(run("json-ld", { rendered: rendered({ jsonLdTypes: [] }) }).status).toBe("fail");
  });

  it("does not judge which type — that is article-schema's decision", () => {
    expect(run("json-ld", { rendered: rendered({ jsonLdTypes: ["Recipe"] }) }).status).toBe("pass");
  });
});

describe("duplicate-meta-description", () => {
  it("fails when another page shares the description", () => {
    expect(
      run("duplicate-meta-description", { duplicates: { title: 1, metaDescription: 4 } }),
    ).toMatchObject({ status: "fail", detail: "4 pages" });
  });

  it("skips an empty description, so the two rules do not double-count", () => {
    // Every page missing a description would otherwise also fail here, and
    // the same gap would appear in two numbers.
    const result = run("duplicate-meta-description", {
      metaDescription: "",
      duplicates: { title: 1, metaDescription: 37 },
    });
    expect(result.status).toBe("skip");
  });
});

describe("og-image", () => {
  it("fails when the entity brought no image", () => {
    expect(run("og-image", { ogImageUrl: null }).status).toBe("fail");
    expect(run("og-image", { ogImageUrl: "  " }).status).toBe("fail");
  });
});

describe("internal-links", () => {
  it("fails on a broken outbound link, and says how many", () => {
    expect(run("internal-links", { brokenInternalLinks: 2 })).toMatchObject({
      status: "fail",
      detail: "2",
    });
  });

  it("skips when the link scan has not run — absent is not zero", () => {
    expect(run("internal-links", { brokenInternalLinks: null }).status).toBe("skip");
  });
});

describe("thin-content", () => {
  it("passes at exactly the threshold", () => {
    expect(run("thin-content", { rendered: rendered({ wordCount: THIN_CONTENT_MIN_WORDS }) }).status).toBe("pass");
  });

  it("fails one word under, and says the count", () => {
    expect(
      run("thin-content", { rendered: rendered({ wordCount: THIN_CONTENT_MIN_WORDS - 1 }) }),
    ).toMatchObject({ status: "fail", detail: `${THIN_CONTENT_MIN_WORDS - 1} words` });
  });
});

describe("image-alt", () => {
  it("fails when any image lacks alt, and gives the proportion", () => {
    expect(
      run("image-alt", { rendered: rendered({ imageCount: 6, imagesMissingAlt: 2 }) }),
    ).toMatchObject({ status: "fail", detail: "2/6" });
  });

  it("skips a page with no images rather than passing it", () => {
    expect(run("image-alt", { rendered: rendered({ imageCount: 0, imagesMissingAlt: 0 }) }).status).toBe("skip");
  });
});

describe("slug-length", () => {
  it("passes at exactly the limit", () => {
    expect(run("slug-length", { slug: "a".repeat(SLUG_MAX_LENGTH) }).status).toBe("pass");
  });

  it("fails one character over", () => {
    expect(run("slug-length", { slug: "a".repeat(SLUG_MAX_LENGTH + 1) })).toMatchObject({
      status: "fail",
      detail: String(SLUG_MAX_LENGTH + 1),
    });
  });

  it("measures the slug, not the path — nobody can shorten /th/projects/", () => {
    const longPath = `/th/projects/${"a".repeat(70)}`;
    expect(run("slug-length", { slug: "a".repeat(70), url: longPath }).status).toBe("pass");
  });
});

describe("translation-complete", () => {
  it("fails when a locale has no row, and says how many there are", () => {
    expect(run("translation-complete", { localeCount: 2 })).toMatchObject({
      status: "fail",
      detail: "2/4",
    });
  });

  it("works for a site with a different number of locales", () => {
    expect(run("translation-complete", { localeCount: 2, siteLocaleCount: 2 }).status).toBe("pass");
  });
});
