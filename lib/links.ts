/**
 * lib/links.ts
 * ─────────────────────────────────────────────────────────────────────────
 * containsLink() — the one check that decides whether a lead's message
 * gets through. Used from both sides of the same trust boundary:
 * LeadForm.tsx's zod resolver (so a visitor sees the rejection before
 * submitting) and leadInquiryServerSchema (so a script posting straight at
 * POST /api/leads, past the form entirely, is held to the same rule).
 *
 * WHY A MESSAGE FIELD IS WORTH BLOCKING LINKS ON AT ALL
 *
 * This is a public, unauthenticated form with a text box a stranger can
 * type anything into. A link there is almost never a genuine buyer — it is
 * an SEO backlink spammer, a phishing redirect, or a scraped promo copied
 * in wholesale — and the sales team reading the CRM inbox has to open
 * every one of them to find out which. Refusing at submit time means that
 * inbox only ever holds messages, not links to somewhere else.
 *
 * WHAT COUNTS AS A LINK HERE
 *
 *   · http(s):// and www. — the unambiguous cases.
 *   · t.me/ — Telegram handles are how a lot of this region's real estate
 *     spam actually invites a reply, not a phone number.
 *   · A markdown-style [text](url) — copy-pasted from somewhere that
 *     supports it, most often a chat client or another listing site.
 *   · A bare domain + a common TLD with no protocol at all
 *     ("myagency.co.th", "bit.ly/x") — the most common real spam shape,
 *     and the one a naive http(s):// check misses entirely.
 *   · An @mention at the start of a word — a social handle, not an email
 *     (the lookbehind two lines down is what tells the two apart).
 *
 * WHAT MUST NOT COUNT, AND WHY EACH ONE NEEDS ITS OWN GUARD
 *
 *   · A phone number ("081-234-5678") — no dot-and-TLD shape at all, so
 *     the domain pattern never engages.
 *   · An email address ("james@gmail.com") — genuinely looks like
 *     "gmail.com" wearing a domain-and-TLD shape once the local part is
 *     stripped away. The domain pattern's `(?<![@.\w])` lookbehind is
 *     exactly this guard: it refuses to start a match immediately after
 *     an "@" (or another word character, so it cannot start mid-token
 *     either), which is precisely where an email's domain half begins.
 *   · A decimal number ("1.5 ล้าน", "24.5 ล้านบาท") — the TLD list is a
 *     fixed allow-list of real, spam-relevant suffixes, not "any short
 *     word after a dot", so a bare number after the dot never matches it.
 *   · Ordinary Thai/Chinese/Russian prose — the domain pattern only
 *     matches ASCII letters/digits/hyphens, which those scripts are not,
 *     so a sentence entirely in one of them never reaches the TLD check
 *     at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

/**
 * Deliberately a fixed allow-list, not "any 2-4 letter suffix after a
 * dot" — the latter would flag "1.5 ล้าน"'s "5" only by accident of
 * length, and would just as easily flag a real short word. Every entry
 * here is a TLD this business has actually seen used for a link, whether
 * as the real top-level domain (.com, .th) or as a URL-shortener's own
 * domain (.ly, .gg) doing the same job.
 */
const LINK_TLDS = [
  "com", "net", "org", "info", "biz", "xyz", "top", "club", "site",
  "online", "shop", "vip", "app", "dev", "link", "click", "live", "store",
  "ly", "io", "cc", "tv", "gg", "gl",
  "th", "cn", "ru", "sg", "hk",
] as const;

const DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";

/**
 * A bare domain, with or without a path — "myagency.co.th", "bit.ly/x".
 * The `(?<![@.\w])` lookbehind is the email/decimal guard; see this
 * file's header for exactly what it stops matching.
 */
const BARE_DOMAIN = new RegExp(
  `(?<![@.\\w])${DOMAIN_LABEL}(?:\\.${DOMAIN_LABEL})*\\.(?:${LINK_TLDS.join("|")})\\b(?:/\\S*)?`,
  "i",
);

const LINK_PATTERNS: readonly RegExp[] = [
  /https?:\/\/\S+/i,
  /\bwww\.[a-z0-9-]+\.[a-z]{2,}\S*/i,
  /\bt\.me\/\S+/i,
  // Markdown link: [label](target). No newlines inside either half —
  // a real one is always typed on one line.
  /\[[^\]\n]+\]\([^)\n]+\)/,
  // @handle at the start of a word, never mid-token — the same
  // start-of-word requirement an email's "@" never satisfies.
  /(?:^|\s)@[a-z0-9_]+/i,
  BARE_DOMAIN,
];

export function containsLink(text: string): boolean {
  return LINK_PATTERNS.some((pattern) => pattern.test(text));
}
