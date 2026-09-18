/**
 * tests/lib/article-schema.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * buildArticleJsonLd() is the exact object both the public article page
 * and the editor's live Schema-tab preview render — these tests exercise
 * it directly rather than through either caller.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { buildArticleJsonLd, type ArticleSchemaInput } from "@/lib/article-schema";

const BASE: ArticleSchemaInput = {
  url: "https://andamanassetsolution.com/en/news/beachfront-villas",
  schemaType: "NewsArticle",
  title: "Beachfront villas in Phuket are in high demand this year",
  metaDescription: "A guide to owning a beachfront villa in Phuket.",
  coverImageUrl: "/img/cover.webp",
  publishedAt: new Date("2026-01-15T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  locale: "en",
  category: "Buying guide",
  tags: ["phuket", "villas"],
  authorName: "Ananya Suksawat",
};

const BRANDING = { legalName: "Andaman Asset Solution", siteUrl: "https://andamanassetsolution.com", logoUrl: "/logo.png" };

describe("buildArticleJsonLd — @type", () => {
  it.each(["NewsArticle", "BlogPosting", "Report"])("emits @type %s when schemaType is set", (schemaType) => {
    const jsonLd = buildArticleJsonLd({ ...BASE, schemaType }, BRANDING);
    expect(jsonLd["@type"]).toBe(schemaType);
  });

  it("falls back to NewsArticle when schemaType is null", () => {
    const jsonLd = buildArticleJsonLd({ ...BASE, schemaType: null }, BRANDING);
    expect(jsonLd["@type"]).toBe("NewsArticle");
  });
});

describe("buildArticleJsonLd — headline", () => {
  it("truncates a headline over 110 characters", () => {
    const longTitle = "A".repeat(150);
    const jsonLd = buildArticleJsonLd({ ...BASE, title: longTitle }, BRANDING);
    // truncate() cuts to 110 chars then appends an ellipsis — 111 total,
    // strictly shorter than the untruncated 150-char input either way.
    const headline = jsonLd.headline as string;
    expect(headline.length).toBeLessThan(longTitle.length);
    expect(headline.endsWith("…")).toBe(true);
  });

  it("leaves a short headline untouched", () => {
    const jsonLd = buildArticleJsonLd(BASE, BRANDING);
    expect(jsonLd.headline).toBe(BASE.title);
  });
});

describe("buildArticleJsonLd — author", () => {
  it("uses a Person when authorName is set", () => {
    const jsonLd = buildArticleJsonLd(BASE, BRANDING);
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Ananya Suksawat" });
  });

  it("falls back to the publisher Organization when authorName is null", () => {
    const jsonLd = buildArticleJsonLd({ ...BASE, authorName: null }, BRANDING);
    expect(jsonLd.author).toEqual({ "@type": "Organization", name: BRANDING.legalName });
  });
});

describe("buildArticleJsonLd — publisher", () => {
  it("resolves a relative logo path against the site URL", () => {
    const jsonLd = buildArticleJsonLd(BASE, BRANDING);
    const publisher = jsonLd.publisher as { logo: { url: string } };
    expect(publisher.logo.url).toBe("https://andamanassetsolution.com/logo.png");
  });

  it("drops the logo url when there isn't one", () => {
    const jsonLd = buildArticleJsonLd(BASE, { ...BRANDING, logoUrl: null });
    const publisher = jsonLd.publisher as { logo: { url: string } };
    expect(publisher.logo.url).toBe("");
  });
});

describe("buildArticleJsonLd — other fields", () => {
  it("carries locale, category, and joined tags", () => {
    const jsonLd = buildArticleJsonLd(BASE, BRANDING);
    expect(jsonLd.inLanguage).toBe("en-US");
    expect(jsonLd.articleSection).toBe("Buying guide");
    expect(jsonLd.keywords).toBe("phuket, villas");
  });

  it("uses th-TH for the Thai locale", () => {
    const jsonLd = buildArticleJsonLd({ ...BASE, locale: "th" }, BRANDING);
    expect(jsonLd.inLanguage).toBe("th-TH");
  });

  it("omits keywords when there are no tags", () => {
    const jsonLd = buildArticleJsonLd({ ...BASE, tags: [] }, BRANDING);
    expect(jsonLd.keywords).toBeUndefined();
  });
});
