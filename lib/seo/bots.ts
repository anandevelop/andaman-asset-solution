/**
 * lib/seo/bots.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Which crawler is asking, from the user agent alone.
 *
 * WHAT THIS IS FOR, AND WHAT IT IS NOT
 *
 * It answers "how often does Googlebot fetch this page" for the indexing
 * screen. It is not a security control and nothing is ever denied on the
 * strength of it: a user agent is a string the client chooses, and anyone
 * can claim to be Googlebot. Verifying a crawler properly means a reverse
 * DNS lookup on every request, which is a real cost on the request path to
 * answer a question nobody is attacking. Where the distinction matters the
 * screen says "claims to be", not "is".
 *
 * ORDER MATTERS IN THE LIST BELOW
 *
 * Several crawlers carry each other's names. Googlebot-Image contains
 * "Googlebot"; "Google-InspectionTool" does not, but does contain
 * "Google"; Bingbot's string contains "compatible" like most of them. The
 * list is therefore ordered most specific first and the first match wins,
 * so "Googlebot-Image" is never filed under plain Googlebot.
 *
 * ONE NAME PER FAMILY
 *
 * Googlebot's desktop and smartphone agents are one bot with two devices.
 * Splitting them would double every row on the screen to answer a question
 * — "is Google crawling us on mobile" — that nobody has asked, and that
 * Search Console answers directly once phase 4 lands.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The crawlers worth a row of their own. Everything else is "other". */
export const BOTS = [
  "googlebot-image",
  "googlebot",
  "google-inspectiontool",
  "google-other",
  "bingbot",
  "yandexbot",
  "baiduspider",
  "duckduckbot",
  "applebot",
  "facebookbot",
  "twitterbot",
  "linespider",
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "dotbot",
  "petalbot",
  "gptbot",
  "claudebot",
  "perplexitybot",
  "bytespider",
  "other",
] as const;

export type BotName = (typeof BOTS)[number];

/*
  Matched in order, first hit wins. The patterns are the distinctive part
  of each agent string, lowercased — not the whole thing, which changes
  with every browser version these crawlers pretend to be.
*/
const PATTERNS: readonly [BotName, string][] = [
  ["googlebot-image", "googlebot-image"],
  ["google-inspectiontool", "google-inspectiontool"],
  ["google-other", "googleother"],
  ["googlebot", "googlebot"],
  ["bingbot", "bingbot"],
  ["yandexbot", "yandexbot"],
  ["baiduspider", "baiduspider"],
  ["duckduckbot", "duckduckbot"],
  ["applebot", "applebot"],
  // Facebook's link preview fetcher, which is what fires when somebody
  // shares a listing — worth seeing separately from a search crawler.
  ["facebookbot", "facebookexternalhit"],
  ["facebookbot", "facebookbot"],
  ["twitterbot", "twitterbot"],
  // LINE's preview fetcher. The client's customers share on LINE far more
  // than on anything else, so this one earns its row here.
  ["linespider", "line-poker"],
  ["linespider", "linespider"],
  ["ahrefsbot", "ahrefsbot"],
  ["semrushbot", "semrushbot"],
  ["mj12bot", "mj12bot"],
  ["dotbot", "dotbot"],
  ["petalbot", "petalbot"],
  ["gptbot", "gptbot"],
  ["claudebot", "claudebot"],
  ["perplexitybot", "perplexitybot"],
  ["bytespider", "bytespider"],
];

/**
 * A generic crawler this list does not name.
 *
 * The hard case is that "bot" on the end of a word proves nothing: a
 * Cubot phone and BLEXBot have the identical shape, and filing real
 * visitors under "other bot" is worse than missing a crawler — the first
 * makes the traffic figures wrong, the second only makes the crawl
 * figures incomplete.
 *
 * What separates them is what follows. A crawler announces a version —
 * "SomeNewBot/1.0" — because that is the convention every one of them
 * follows; a phone model does not ("CUBOT NOTE 20"). So the name must be
 * followed by a slash. "crawler" and "spider" are distinctive enough on
 * their own as whole words, and are matched that way too.
 */
const GENERIC = /(?:bot|crawler|spider)\/|(?:^|[^a-z])(?:crawler|spider|crawling)(?:[^a-z]|$)/;

/**
 * The crawler behind a user agent, or null for anything that looks like a
 * person.
 */
export function identifyBot(userAgent: string | null | undefined): BotName | null {
  if (!userAgent) return null;

  const agent = userAgent.toLowerCase();

  for (const [name, pattern] of PATTERNS) {
    if (agent.includes(pattern)) return name;
  }

  return GENERIC.test(agent) ? "other" : null;
}

/** Whether this user agent is a crawler at all. */
export function isBot(userAgent: string | null | undefined): boolean {
  return identifyBot(userAgent) !== null;
}

/**
 * The crawlers whose behaviour says something about search.
 *
 * The indexing screen leads with these; the scrapers and the preview
 * fetchers are real traffic but say nothing about whether Google can see
 * the site.
 */
export const SEARCH_BOTS: readonly BotName[] = [
  "googlebot",
  "googlebot-image",
  "google-inspectiontool",
  "google-other",
  "bingbot",
  "yandexbot",
  "baiduspider",
  "duckduckbot",
  "applebot",
];
