/**
 * lib/article-embeds.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Splitting a rendered article body around the blocks that cannot be
 * plain HTML — today that is exactly one: the project card.
 *
 * Every other block from Phase 2b-5 is markup the sanitizer already
 * allows, styled by prose-article, and so travels the whole way to the
 * page as part of one HTML string. The project card cannot: the author
 * stores a reference (`<figure data-block="project-card">` around a link
 * to `/projects/<slug>`) and the page has to turn that into the real card,
 * with the project's photograph, status and specs read from the database
 * at render time. §5.3 asks for the reference to be the slug rather than
 * an id precisely so the stored markup stays legible without a database.
 *
 * WHY SEGMENTS RATHER THAN STRING SUBSTITUTION
 *
 * The obvious implementation builds the card's HTML and splices it into
 * the string. That means hand-escaping every project field on the way in,
 * one missed call away from reintroducing exactly the injection hole three
 * commits of `data-*`-only blocks were shaped to avoid — and it means a
 * second copy of the card's markup, which components/FeaturedProjectCard's
 * own header exists to prevent ("one card, one status palette"). So this
 * returns segments instead and the page renders the real component
 * between them. Nothing here ever concatenates HTML.
 *
 * WHY AN ARTICLE WITHOUT A CARD YIELDS EXACTLY ONE SEGMENT
 *
 * prose-article's vertical rhythm is `& > * + *`, so what counts as a
 * direct child of that element is load-bearing. One segment means the page
 * renders one `.prose-article` div holding the whole body, byte for byte
 * what it rendered before this file existed — which is every article
 * written so far.
 *
 * THE MATCH IS DELIBERATELY EXACT, AND FAILURE IS A LINK
 *
 * The pattern only recognises what RichTextEditor's own serializer emits.
 * Anything else — a hand-typed figure, a card whose link was removed, a
 * slug that no longer names a published project — stays in an html segment
 * and renders as the ordinary link it already is. A reader sees a link to
 * a project instead of a card; nobody sees a gap where content used to be.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type ArticleSegment =
  | { kind: "html"; html: string }
  /** The slug is whatever the block's link pointed at; the page decides
   *  whether it still resolves, and falls back to `html` if it does not. */
  | { kind: "projectCard"; slug: string; html: string };

/*
  Non-greedy up to the first </figure>, which is safe because this block's
  content is a single paragraph — our serializer cannot nest a figure
  inside one. Attribute-order-insensitive on the opening tag: the string
  has been through DOMPurify by this point and is not guaranteed to come
  back spelled the way TipTap wrote it.
*/
const PROJECT_CARD = /<figure\b[^>]*\bdata-block="project-card"[^>]*>[\s\S]*?<\/figure>/g;

/** The slug out of the block's own link. Query and hash are dropped; a
 *  locale prefix is not expected (InternalLinkModal stores locale-relative
 *  paths — see its header) but is tolerated rather than mis-parsed. */
const PROJECT_HREF = /href="(?:\/[a-z]{2})?\/projects\/([^"#?/]+)/;

/**
 * Split a rendered, sanitized article body into renderable segments.
 *
 * Returns a single html segment when there is nothing to substitute, which
 * is the case for every article that does not use the block.
 */
export function splitArticleEmbeds(html: string): ArticleSegment[] {
  if (!html) return [{ kind: "html", html }];

  const segments: ArticleSegment[] = [];
  let cursor = 0;

  for (const match of html.matchAll(PROJECT_CARD)) {
    const block = match[0];
    const slug = PROJECT_HREF.exec(block)?.[1];

    // No link inside it — an author inserted the block and never pointed
    // it anywhere. Left in the surrounding html so it stays visible and
    // editable rather than silently dropped.
    if (!slug) continue;

    const before = html.slice(cursor, match.index);
    if (before) segments.push({ kind: "html", html: before });

    segments.push({ kind: "projectCard", slug, html: block });
    cursor = match.index + block.length;
  }

  const rest = html.slice(cursor);
  // The `|| segments.length === 0` arm is what guarantees the one-segment
  // result for a body with no card: an empty tail after a trailing card
  // should not add an empty div, but an empty body still has to render.
  if (rest || segments.length === 0) segments.push({ kind: "html", html: rest });

  return segments;
}

/** Every project slug an article's body asks for, in document order and
 *  without repeats — so a page can resolve them in one query. */
export function projectCardSlugs(html: string): string[] {
  const slugs = splitArticleEmbeds(html)
    .filter((segment): segment is Extract<ArticleSegment, { kind: "projectCard" }> =>
      segment.kind === "projectCard",
    )
    .map((segment) => segment.slug);

  return [...new Set(slugs)];
}
