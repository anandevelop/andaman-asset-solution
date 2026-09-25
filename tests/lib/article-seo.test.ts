/**
 * tests/lib/article-seo.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Each check's pass/fail/warn boundary, exercised individually — a
 * checklist that silently always passes (or always fails) one row is
 * worse than no checklist, since an editor trusts the score to mean
 * something. Migrated from tests/lib/seo-score.test.ts when
 * lib/seo-score.ts was replaced by lib/article-seo.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { marked } from "marked";
import { auditArticle, type SeoScoreInput } from "@/lib/article-seo";

/** A complete, passing article — each test below mutates one field off
 *  this baseline and checks exactly that one check's status flips. */
const BASE: SeoScoreInput = {
  title: "This year, beachfront villas in Phuket are in high demand.",
  metaTitle: "Best beachfront villas in Phuket | Andaman Asset Solution",
  metaDescription:
    "Explore beachfront villas in Phuket with private pools, sea views, and flexible ownership options for international buyers seeking a home abroad.",
  slug: "beachfront-villas-phuket",
  excerpt: "A guide to owning a beachfront villa in Phuket, from budget to paperwork.",
  focusKeyword: "beachfront villas",
  content: [
    "This year, beachfront villas in Phuket are in high demand among buyers.",
    "## Why buyers choose Phuket",
    "Phuket offers a mix of lifestyle and investment upside that few markets match anywhere in Southeast Asia.",
    "### Financing options",
    "Most buyers use a mix of savings and local financing arranged through [our partner bank](/partners/bank).",
    "## Where to look",
    "Consider [Bang Tao](/projects/bang-tao) and [Laguna](https://www.lagunaphuket.com) for beachfront access.",
    "![A beachfront villa pool](/img/villa-pool.webp)",
    Array.from({ length: 60 }, () => "word word word word word word word word word word.").join(" "),
  ].join("\n\n"),
  coverImageUrl: "/img/cover.webp",
  ogImageUrl: "/img/og.webp",
  contentFormat: "MARKDOWN",
  languageComplete: true,
};

function checkFor(id: string, input: SeoScoreInput) {
  return auditArticle(input).checks.find((c) => c.id === id);
}

function statusOf(id: string, input: SeoScoreInput) {
  return checkFor(id, input)?.status;
}

describe("auditArticle — baseline", () => {
  it("passes every check a Markdown article can", () => {
    // Every one but hasFaqBlock: the FAQ block only exists in the
    // rich-text editor, so a MARKDOWN article cannot hold one. That is a
    // real "not done" rather than a quirk of the fixture, and the way out
    // is the convert-to-rich-text banner in NewsForm.
    const { checks, score } = auditArticle(BASE);
    const failed = checks.filter((c) => c.status !== "pass").map((c) => c.id);

    expect(failed).toEqual(["hasFaqBlock"]);
    expect(score).toBe(96); // round(43 / 45 * 100)
  });

  it("scores 100 once the article is rich text and carries a FAQ block", () => {
    const { score } = auditArticle({
      ...BASE,
      contentFormat: "HTML",
      content:
        marked.parse(BASE.content, { async: false }) +
        '<ul data-faq="list"><li data-faq="item">' +
        '<h3 data-faq="question">Can foreigners own?</h3><p>Leasehold or company.</p>' +
        "</li></ul>",
    });

    expect(score).toBe(100);
  });

  it("carries a total weight of 45 across 21 checks", () => {
    const { checks } = auditArticle(BASE);
    expect(checks).toHaveLength(21);
    expect(checks.reduce((sum, c) => sum + c.weight, 0)).toBe(45);
  });
});

describe("auditArticle — keyword checks", () => {
  it("fails every keyword check when focusKeyword is blank", () => {
    const result = auditArticle({ ...BASE, focusKeyword: "" });
    for (const id of ["keywordInTitle", "keywordInMetaTitle", "keywordInMetaDescription", "keywordInFirstParagraph"]) {
      expect(result.checks.find((c) => c.id === id)?.status).not.toBe("pass");
    }
  });

  it("fails keywordInTitle only when the title contains it", () => {
    expect(statusOf("keywordInTitle", { ...BASE, title: "Something else entirely" })).not.toBe("pass");
  });

  it("matches a keyword regardless of case", () => {
    expect(
      statusOf("keywordInTitle", { ...BASE, title: "This year, BEACHFRONT VILLAS in Phuket are trending" }),
    ).toBe("pass");
    expect(statusOf("keywordInMetaTitle", { ...BASE, focusKeyword: "BEACHFRONT VILLAS" })).toBe("pass");
  });
});

describe("auditArticle — length checks", () => {
  it("fails metaTitleLength when too short or too long", () => {
    expect(statusOf("metaTitleLength", { ...BASE, metaTitle: "Short" })).not.toBe("pass");
    expect(statusOf("metaTitleLength", { ...BASE, metaTitle: "x".repeat(61) })).not.toBe("pass");
    expect(statusOf("metaTitleLength", BASE)).toBe("pass");
  });

  it("fails metaDescriptionLength when too short or too long", () => {
    expect(statusOf("metaDescriptionLength", { ...BASE, metaDescription: "Too short." })).not.toBe("pass");
    expect(statusOf("metaDescriptionLength", { ...BASE, metaDescription: "x".repeat(161) })).not.toBe("pass");
  });

  it("fails bodyLength under 600 words", () => {
    expect(statusOf("bodyLength", { ...BASE, content: "Too short." })).not.toBe("pass");
  });

  it("fails excerptLength under 60 characters", () => {
    expect(statusOf("excerptLength", { ...BASE, excerpt: "Too short." })).not.toBe("pass");
  });
});

describe("auditArticle — structural checks", () => {
  it("fails hasEnoughH2 with fewer than 2 H2 headings", () => {
    expect(statusOf("hasEnoughH2", { ...BASE, content: "## Only one heading\n\ntext" })).not.toBe("pass");
  });

  it("fails hasH3 with no H3 heading", () => {
    expect(statusOf("hasH3", { ...BASE, content: "## A\n\ntext\n\n## B\n\ntext" })).not.toBe("pass");
  });

  it("passes singleH1 with zero or one H1, fails (fail-tier) with two", () => {
    expect(statusOf("singleH1", BASE)).toBe("pass"); // zero H1s in the baseline body
    expect(statusOf("singleH1", { ...BASE, content: `# One\n\n${BASE.content}` })).toBe("pass");
    expect(statusOf("singleH1", { ...BASE, content: `# One\n\n# Two\n\n${BASE.content}` })).toBe("fail");
  });

  it("reads headings from HTML when contentFormat is HTML", () => {
    const html = "<h1>One</h1><h1>Two</h1><h2>A</h2><h2>B</h2><h3>C</h3>";
    expect(statusOf("singleH1", { ...BASE, content: html, contentFormat: "HTML" })).toBe("fail");
    expect(statusOf("hasEnoughH2", { ...BASE, content: html, contentFormat: "HTML" })).toBe("pass");
  });

  it("fails internalLinks with fewer than 2 internal links", () => {
    expect(statusOf("internalLinks", { ...BASE, content: "[one](/a) plain text with no more links" })).not.toBe(
      "pass",
    );
  });

  it("fails externalLinks with no external link", () => {
    expect(statusOf("externalLinks", { ...BASE, content: "[one](/a) [two](/b)" })).not.toBe("pass");
  });

  it("fails hasImage with no image", () => {
    expect(statusOf("hasImage", { ...BASE, content: "Plain text, no images at all here." })).not.toBe("pass");
  });

  describe("headingHierarchy — fail-tier, forced regardless of weight", () => {
    it("fails when a heading skips a level", () => {
      expect(statusOf("headingHierarchy", { ...BASE, content: "## A\n\n#### B" })).toBe("fail");
    });

    it("passes a clean H2 → H3 → H4 descent", () => {
      expect(statusOf("headingHierarchy", { ...BASE, content: "## A\n\n### B\n\n#### C" })).toBe("pass");
    });

    it("does not flag the first heading regardless of its level", () => {
      expect(statusOf("headingHierarchy", { ...BASE, content: "#### Starts deep\n\ntext" })).toBe("pass");
    });

    it("does not flag going back up or staying level", () => {
      expect(statusOf("headingHierarchy", { ...BASE, content: "## A\n\n### B\n\n## C\n\n## D" })).toBe("pass");
    });

    it("reads heading skips from HTML too", () => {
      expect(
        statusOf("headingHierarchy", { ...BASE, content: "<h2>A</h2><h5>B</h5>", contentFormat: "HTML" }),
      ).toBe("fail");
    });
  });

  describe("imageAltText — fail-tier (weight 3)", () => {
    it("passes when there are no images at all", () => {
      expect(statusOf("imageAltText", { ...BASE, content: "Plain text, no images here." })).toBe("pass");
    });

    it("passes when every Markdown image has non-empty alt text", () => {
      expect(statusOf("imageAltText", BASE)).toBe("pass");
    });

    it("fails on a Markdown image with empty alt text", () => {
      expect(statusOf("imageAltText", { ...BASE, content: "![](/img/no-alt.webp)" })).toBe("fail");
    });

    it("fails on an HTML <img> with no alt attribute at all", () => {
      expect(
        statusOf("imageAltText", { ...BASE, content: '<p><img src="/img/x.webp"></p>', contentFormat: "HTML" }),
      ).toBe("fail");
    });

    it("fails on an HTML <img> with a blank alt attribute", () => {
      expect(
        statusOf("imageAltText", {
          ...BASE,
          content: '<p><img src="/img/x.webp" alt=""></p>',
          contentFormat: "HTML",
        }),
      ).toBe("fail");
    });

    it("passes on an HTML <img> with real alt text", () => {
      expect(
        statusOf("imageAltText", {
          ...BASE,
          content: '<p><img src="/img/x.webp" alt="A villa pool"></p>',
          contentFormat: "HTML",
        }),
      ).toBe("pass");
    });
  });
});

describe("auditArticle — slug and sharing", () => {
  it("fails slugFormat on uppercase, spaces, or overlong slugs", () => {
    expect(statusOf("slugFormat", { ...BASE, slug: "Not Valid" })).not.toBe("pass");
    expect(statusOf("slugFormat", { ...BASE, slug: "a".repeat(61) })).not.toBe("pass");
    expect(statusOf("slugFormat", BASE)).toBe("pass");
  });

  it("passes hasShareImages only when BOTH a cover and an OG image are set", () => {
    expect(statusOf("hasShareImages", { ...BASE, coverImageUrl: null, ogImageUrl: null })).not.toBe("pass");
    // Cover-only, no OG image — this is the case the predecessor check
    // (shareImageSet) used to pass on OR semantics; it must fail now.
    expect(statusOf("hasShareImages", { ...BASE, coverImageUrl: "/cover.webp", ogImageUrl: null })).not.toBe(
      "pass",
    );
    expect(statusOf("hasShareImages", { ...BASE, coverImageUrl: null, ogImageUrl: "/og.webp" })).not.toBe("pass");
    expect(statusOf("hasShareImages", { ...BASE, coverImageUrl: "/cover.webp", ogImageUrl: "/og.webp" })).toBe(
      "pass",
    );
  });

  it("mirrors the languageComplete input directly", () => {
    expect(statusOf("languageComplete", { ...BASE, languageComplete: false })).not.toBe("pass");
  });
});

describe("auditArticle — hasBlockingFailure", () => {
  it("is false when nothing is at fail-tier", () => {
    expect(auditArticle(BASE).hasBlockingFailure).toBe(false);
  });

  it("is true when a weight-3 check fails", () => {
    expect(auditArticle({ ...BASE, content: "Too short." }).hasBlockingFailure).toBe(true);
  });

  it("is true when a forced fail-tier check fails even at a lower weight", () => {
    const twoH1s = { ...BASE, content: `# One\n\n# Two\n\n${BASE.content}` };
    expect(checkFor("singleH1", twoH1s)?.weight).toBe(2);
    expect(auditArticle(twoH1s).hasBlockingFailure).toBe(true);
  });

  it("is false when only warn-tier checks fail", () => {
    // hasH3 (weight 1) is the only thing broken here — everything else in
    // BASE still holds, and weight-1 failures are warn-tier, not fail-tier.
    const noH3 = { ...BASE, content: BASE.content.replace("### Financing options", "Financing options") };
    const result = auditArticle(noH3);
    expect(result.checks.find((c) => c.id === "hasH3")?.status).toBe("warn");
    expect(result.hasBlockingFailure).toBe(false);
  });
});

describe("auditArticle — score math", () => {
  it("scores near zero when almost every check fails", () => {
    // imageAltText passes vacuously (no images at all is not itself an
    // alt-text violation — hasImage is the separate check for "no image"),
    // and sentenceLength also passes here since three one-word headings
    // ("A", "B", "C") average well under 28 words/sentence as plain text —
    // both are genuine, not bugs. Every other check fails.
    const empty: SeoScoreInput = {
      title: "",
      metaTitle: "",
      metaDescription: "",
      slug: "",
      excerpt: "",
      focusKeyword: "",
      // Two H1s (singleH1 fails) plus a level skip (headingHierarchy
      // fails), no H2/H3 at all.
      content: "# A\n\n# B\n\n#### C",
      coverImageUrl: null,
      ogImageUrl: null,
      contentFormat: "MARKDOWN",
      languageComplete: false,
    };
    const { score, checks } = auditArticle(empty);
    const passing = checks.filter((c) => c.status === "pass");
    expect(passing.map((c) => c.id).sort()).toEqual(["imageAltText", "sentenceLength"]);
    expect(score).toBe(9); // round((3 + 1) / 45 * 100)
  });
});
