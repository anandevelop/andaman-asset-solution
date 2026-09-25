/**
 * tests/faq-block.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Reading the FAQ block back out of stored article HTML.
 *
 * Two TODOs waited on this — lib/article-seo.ts's "has an FAQ block" check
 * and lib/article-schema.ts's FAQPage JSON-LD — and both of those files
 * were explicit that heuristics must not stand in for it. So the tests
 * that matter most here are the negative ones: content that merely looks
 * like a FAQ must not be mistaken for one, or the checklist item and the
 * structured data both start making claims nobody authored.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { extractFaqItems, hasFaqBlock } from "@/lib/faq-block";

const BLOCK =
  '<ul data-faq="list">' +
  '<li data-faq="item"><h3 data-faq="question">Can foreigners own a villa?</h3><p>Through a leasehold or a company.</p></li>' +
  '<li data-faq="item"><h3 data-faq="question">How long is construction?</h3><p>About <strong>18 months</strong>.</p><p>Weather permitting.</p></li>' +
  "</ul>";

describe("extractFaqItems", () => {
  it("pulls out each question with its answer", () => {
    expect(extractFaqItems(BLOCK)).toEqual([
      { question: "Can foreigners own a villa?", answer: "Through a leasehold or a company." },
      { question: "How long is construction?", answer: "About 18 months. Weather permitting." },
    ]);
  });

  it("returns nothing for an article without one", () => {
    expect(extractFaqItems("<p>Just prose.</p>")).toEqual([]);
    expect(extractFaqItems("")).toEqual([]);
    expect(extractFaqItems(null)).toEqual([]);
  });

  it("skips an item missing its question or its answer", () => {
    // A FAQPage carrying a blank question is worse than one question
    // fewer — Google treats it as a reason to distrust the whole block.
    const partial =
      '<ul data-faq="list">' +
      '<li data-faq="item"><h3 data-faq="question">No answer here</h3></li>' +
      '<li data-faq="item"><p>An answer with no question.</p></li>' +
      '<li data-faq="item"><h3 data-faq="question">Good one</h3><p>Yes.</p></li>' +
      "</ul>";

    expect(extractFaqItems(partial)).toEqual([{ question: "Good one", answer: "Yes." }]);
  });
});

describe("hasFaqBlock — refuses to guess", () => {
  it("is true only for the real block", () => {
    expect(hasFaqBlock(BLOCK, "HTML")).toBe(true);
  });

  it("is not fooled by a heading that says FAQ", () => {
    expect(hasFaqBlock("<h2>FAQ</h2><p>Q: really? A: no.</p>", "HTML")).toBe(false);
  });

  it("is not fooled by a plain list of questions", () => {
    expect(
      hasFaqBlock("<ul><li><h3>Is this a FAQ?</h3><p>It is not.</p></li></ul>", "HTML"),
    ).toBe(false);
  });

  it("is not fooled by a definition list", () => {
    expect(hasFaqBlock("<dl><dt>Question</dt><dd>Answer</dd></dl>", "HTML")).toBe(false);
  });

  it("is false for a Markdown article, which cannot hold the block at all", () => {
    expect(hasFaqBlock(BLOCK, "MARKDOWN")).toBe(false);
  });
});
