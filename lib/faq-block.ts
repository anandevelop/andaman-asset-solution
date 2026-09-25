/**
 * lib/faq-block.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Reading the FAQ block back out of an article's stored HTML.
 *
 * Two places need this and neither can share the editor's own schema:
 * lib/article-seo.ts scores "has an FAQ block" (and runs in the browser,
 * live, as the author types), and lib/article-schema.ts emits the FAQPage
 * JSON-LD that makes those questions eligible for a rich result. Both get
 * a string of saved HTML, so the block has to be recognisable from the
 * markup alone.
 *
 * This is the detection those two files' TODOs said to wait for. They were
 * explicit that heuristics — sniffing for a heading that says "FAQ", or for
 * a <dl> — must not stand in for it, because a check that passes on
 * content nobody authored as a FAQ is worse than one that always fails:
 * the score stops meaning anything. So detection is exact, keyed on the
 * `data-faq` attribute the editor's own node writes and nothing else
 * produces.
 *
 * String matching rather than DOM parsing, for the same reason
 * lib/paste-html.ts does it: this runs on the server and in the browser,
 * and article-seo re-runs it on every keystroke.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type FaqItem = { question: string; answer: string };

/** `<li data-faq="item">` … `</li>`, non-greedy so sibling items do not
 *  swallow each other. */
const ITEM = /<li[^>]*\bdata-faq=["']item["'][^>]*>([\s\S]*?)<\/li>/gi;
const QUESTION = /<h3[^>]*\bdata-faq=["']question["'][^>]*>([\s\S]*?)<\/h3>/i;

/** Tags out, entities in, whitespace collapsed — JSON-LD wants the words,
 *  not the markup around them. */
function toText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    // Tags become a space so words either side of one stay apart
    // ("months</p><p>Weather" must not read as "monthsWeather") — which
    // leaves a stray space in front of punctuation that followed a tag,
    // as in "<strong>18 months</strong>." Closing it up here rather than
    // dropping the space, which would be the worse trade.
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Every Q&A pair in the article, in document order.
 *
 * An item with no question text, or no answer, is skipped rather than
 * emitted empty: a FAQPage carrying a blank question is worse than one
 * question fewer, and Google treats it as a reason to distrust the lot.
 */
export function extractFaqItems(html: string | null | undefined): FaqItem[] {
  if (!html) return [];

  const items: FaqItem[] = [];

  for (const match of html.matchAll(ITEM)) {
    const inner = match[1];
    const question = QUESTION.exec(inner);
    if (!question) continue;

    const questionText = toText(question[1]);
    const answerText = toText(inner.replace(QUESTION, ""));

    if (questionText && answerText) items.push({ question: questionText, answer: answerText });
  }

  return items;
}

/**
 * Whether the article carries a real FAQ block with at least one complete
 * pair — which is what the checklist item is actually asking, and what the
 * JSON-LD needs to be worth emitting.
 *
 * MARKDOWN articles always return false: the block only exists in the
 * rich-text editor, and an old Markdown article has no way to hold one.
 * That is a fair "not done" rather than a false failure.
 */
export function hasFaqBlock(
  html: string | null | undefined,
  format: "HTML" | "MARKDOWN",
): boolean {
  if (format !== "HTML") return false;
  return extractFaqItems(html).length > 0;
}
