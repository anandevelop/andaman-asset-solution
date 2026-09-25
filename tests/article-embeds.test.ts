/**
 * tests/article-embeds.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * lib/article-embeds.ts decides where an article body is interrupted so a
 * real project card can be rendered in its place. Two properties matter
 * more than the substitution itself:
 *
 *   - a body with no card comes back as exactly one segment, because
 *     prose-article spaces its children with `& > * + *` and splitting an
 *     ordinary article into wrappers would collapse the gaps inside each
 *     one. That is every article written before this existed.
 *   - nothing it does not recognise is ever dropped. The block degrades to
 *     the link it already contains.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { projectCardSlugs, splitArticleEmbeds } from "@/lib/article-embeds";

const CARD = (slug: string, name = "Residence Prime") =>
  `<figure data-block="project-card"><p><a href="/projects/${slug}">${name}</a></p></figure>`;

describe("splitArticleEmbeds — bodies with nothing to substitute", () => {
  it("returns one segment for an ordinary article", () => {
    const html = "<p>One.</p><h2>A heading</h2><p>Two.</p>";
    expect(splitArticleEmbeds(html)).toEqual([{ kind: "html", html }]);
  });

  it("returns one segment for an empty body", () => {
    expect(splitArticleEmbeds("")).toEqual([{ kind: "html", html: "" }]);
  });

  it("leaves the other ready-made blocks alone", () => {
    // They are all plain markup the sanitizer allows — only the project
    // card needs the database, so only it may interrupt the string.
    const html =
      '<blockquote data-block="callout" data-tone="note"><p>A.</p></blockquote>' +
      '<blockquote data-block="pull-quote"><p>B.</p><p data-block="quote-attribution">C</p></blockquote>' +
      '<figure data-block="cta"><p>D</p><p data-block="cta-action"><a href="/contact">E</a></p></figure>';

    expect(splitArticleEmbeds(html)).toEqual([{ kind: "html", html }]);
  });

  it("leaves an ordinary image figure alone", () => {
    const html = '<figure><img src="/a.jpg" alt="x"><figcaption>y</figcaption></figure>';
    expect(splitArticleEmbeds(html)).toEqual([{ kind: "html", html }]);
  });
});

describe("splitArticleEmbeds — bodies with a card", () => {
  it("splits the body around it and keeps the slug", () => {
    const segments = splitArticleEmbeds(`<p>Before.</p>${CARD("residence-prime")}<p>After.</p>`);

    expect(segments).toEqual([
      { kind: "html", html: "<p>Before.</p>" },
      { kind: "projectCard", slug: "residence-prime", html: CARD("residence-prime") },
      { kind: "html", html: "<p>After.</p>" },
    ]);
  });

  it("emits no empty html segment before a leading or after a trailing card", () => {
    const segments = splitArticleEmbeds(CARD("a"));
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ kind: "projectCard", slug: "a" });
  });

  it("handles two cards in a row", () => {
    const segments = splitArticleEmbeds(`${CARD("a")}${CARD("b")}<p>End.</p>`);
    expect(segments.map((s) => s.kind)).toEqual(["projectCard", "projectCard", "html"]);
    expect(projectCardSlugs(`${CARD("a")}${CARD("b")}<p>End.</p>`)).toEqual(["a", "b"]);
  });

  it("does not care what order the attributes come back in", () => {
    // The string has been through DOMPurify by this point and is not
    // guaranteed to be spelled the way TipTap wrote it.
    const html = '<figure class-less data-block="project-card"><p><a href="/projects/z">Z</a></p></figure>';
    expect(splitArticleEmbeds(html)[0]).toMatchObject({ kind: "projectCard", slug: "z" });
  });

  it("reads the slug through a locale prefix", () => {
    const html =
      '<figure data-block="project-card"><p><a href="/th/projects/sea-ridge">S</a></p></figure>';
    expect(splitArticleEmbeds(html)[0]).toMatchObject({ kind: "projectCard", slug: "sea-ridge" });
  });

  it("drops a trailing slash, query and hash from the slug", () => {
    const html =
      '<figure data-block="project-card"><p><a href="/projects/sea-ridge?utm=x#top">S</a></p></figure>';
    expect(splitArticleEmbeds(html)[0]).toMatchObject({ kind: "projectCard", slug: "sea-ridge" });
  });

  it("reports each slug once even when the same project is embedded twice", () => {
    expect(projectCardSlugs(`${CARD("a")}<p>x</p>${CARD("a")}`)).toEqual(["a"]);
  });
});

describe("splitArticleEmbeds — what it refuses to touch", () => {
  it("leaves a card with no link inside the surrounding html", () => {
    // An author inserted the block and never pointed it anywhere. There is
    // nothing to resolve, so it stays where it is rather than vanishing.
    const html = '<p>A.</p><figure data-block="project-card"><p>Pick one</p></figure><p>B.</p>';
    expect(splitArticleEmbeds(html)).toEqual([{ kind: "html", html }]);
  });

  it("leaves a link to a project that is not wrapped in the block", () => {
    const html = '<p>See <a href="/projects/residence-prime">Residence Prime</a>.</p>';
    expect(splitArticleEmbeds(html)).toEqual([{ kind: "html", html }]);
    expect(projectCardSlugs(html)).toEqual([]);
  });

  it("keeps the block's own html so an unresolved card can still render", () => {
    const segments = splitArticleEmbeds(CARD("gone"));
    expect(segments[0]).toMatchObject({ html: CARD("gone") });
  });

  it("does not let one card swallow the rest of the body", () => {
    // The guard against a greedy match: everything between the first
    // card's </figure> and the second's would disappear.
    const html = `${CARD("a")}<p>Kept.</p>${CARD("b")}`;
    const segments = splitArticleEmbeds(html);
    expect(segments.map((s) => s.kind)).toEqual(["projectCard", "html", "projectCard"]);
    expect(segments[1]).toEqual({ kind: "html", html: "<p>Kept.</p>" });
  });
});
