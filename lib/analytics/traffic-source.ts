/**
 * lib/analytics/traffic-source.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Where a visit came from: one channel and one short source name, from the
 * referring host and the utm tags the visit landed with.
 *
 * AI IS ITS OWN CHANNEL
 *
 * A visitor who clicked a link inside ChatGPT, Gemini, Perplexity, Claude
 * or Copilot is the number the client asked for, so those hosts are
 * matched first and filed under AI rather than under search or referral.
 * ChatGPT also tags its links with utm_source=chatgpt.com, which survives
 * when the browser strips the referrer — the tag is checked too.
 *
 * What this cannot see: an AI agent that reads the page for somebody
 * (ChatGPT-User, Perplexity-User, Claude-User) runs no JavaScript, so it
 * never sends a beacon. Those are counted by user agent in the crawl log
 * (lib/seo/bots.ts, AI_AGENT_BOTS) and shown beside these numbers.
 *
 * Pure and shared: the browser does not classify (it only reports the
 * host), the server does, and the tests call it directly.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const TRAFFIC_CHANNELS = ["AI", "SEARCH", "SOCIAL", "CAMPAIGN", "REFERRAL", "DIRECT"] as const;
export type Channel = (typeof TRAFFIC_CHANNELS)[number];

export type VisitOrigin = {
  /** Host only, "" for none. */
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  /** The landing URL carried gclid / fbclid (an ad click). */
  gclid?: boolean;
  fbclid?: boolean;
};

export type Classified = { channel: Channel; source: string };

/*
  [source, channel, host suffixes]. A host matches a suffix when it equals
  it or ends with "." + it, so "l.facebook.com" is facebook and
  "notfacebook.com" is not. Order matters only where suffixes overlap:
  gemini.google.com must be tested before google.
*/
const HOSTS: readonly [string, Channel, readonly string[]][] = [
  // ── AI assistants ─────────────────────────────────────────────────────
  ["chatgpt", "AI", ["chatgpt.com", "chat.openai.com", "openai.com"]],
  ["gemini", "AI", ["gemini.google.com", "bard.google.com"]],
  ["perplexity", "AI", ["perplexity.ai"]],
  ["claude", "AI", ["claude.ai"]],
  ["copilot", "AI", ["copilot.microsoft.com", "copilot.cloud.microsoft"]],
  ["deepseek", "AI", ["chat.deepseek.com", "deepseek.com"]],
  ["meta-ai", "AI", ["meta.ai"]],
  ["grok", "AI", ["grok.com", "x.ai"]],
  ["mistral", "AI", ["chat.mistral.ai", "mistral.ai"]],
  ["poe", "AI", ["poe.com"]],
  ["you", "AI", ["you.com"]],
  ["phind", "AI", ["phind.com"]],
  ["kimi", "AI", ["kimi.moonshot.cn", "kimi.com"]],
  ["doubao", "AI", ["doubao.com"]],
  ["qwen", "AI", ["chat.qwen.ai", "tongyi.aliyun.com"]],

  // ── Search ────────────────────────────────────────────────────────────
  ["google", "SEARCH", ["google.com", "google.co.th", "google.co.uk", "google.com.au", "google.ru", "google.de", "google.com.hk", "google.com.sg", "google.cn"]],
  ["bing", "SEARCH", ["bing.com"]],
  ["yahoo", "SEARCH", ["yahoo.com", "yahoo.co.jp"]],
  ["duckduckgo", "SEARCH", ["duckduckgo.com"]],
  ["baidu", "SEARCH", ["baidu.com"]],
  ["yandex", "SEARCH", ["yandex.ru", "yandex.com", "ya.ru"]],
  ["naver", "SEARCH", ["naver.com"]],
  ["ecosia", "SEARCH", ["ecosia.org"]],
  ["brave", "SEARCH", ["search.brave.com"]],
  ["sogou", "SEARCH", ["sogou.com"]],

  // ── Social ────────────────────────────────────────────────────────────
  ["facebook", "SOCIAL", ["facebook.com", "fb.com", "fb.me", "messenger.com", "m.me"]],
  ["instagram", "SOCIAL", ["instagram.com"]],
  ["line", "SOCIAL", ["line.me", "lin.ee", "line-apps.com", "line.naver.jp"]],
  ["tiktok", "SOCIAL", ["tiktok.com"]],
  ["youtube", "SOCIAL", ["youtube.com", "youtu.be"]],
  ["x", "SOCIAL", ["twitter.com", "t.co", "x.com"]],
  ["linkedin", "SOCIAL", ["linkedin.com", "lnkd.in"]],
  ["pinterest", "SOCIAL", ["pinterest.com"]],
  ["whatsapp", "SOCIAL", ["whatsapp.com", "wa.me"]],
  ["wechat", "SOCIAL", ["weixin.qq.com", "wechat.com"]],
  ["vk", "SOCIAL", ["vk.com"]],
  ["telegram", "SOCIAL", ["t.me", "telegram.org"]],
  ["reddit", "SOCIAL", ["reddit.com"]],
  ["threads", "SOCIAL", ["threads.net", "threads.com"]],
];

/* utm_source values the AI products and the big platforms actually send,
   lowercased, mapped to the same names as above. */
const UTM_SOURCES: Record<string, string> = {
  "chatgpt.com": "chatgpt",
  chatgpt: "chatgpt",
  openai: "chatgpt",
  "perplexity.ai": "perplexity",
  perplexity: "perplexity",
  gemini: "gemini",
  "claude.ai": "claude",
  claude: "claude",
  copilot: "copilot",
  google: "google",
  facebook: "facebook",
  fb: "facebook",
  ig: "instagram",
  instagram: "instagram",
  line: "line",
  tiktok: "tiktok",
  youtube: "youtube",
};

const PAID_MEDIUM = /^(cpc|ppc|paid|paidsocial|paid_social|paid-social|display|cpm|ads?)$/;

/** Lowercased, without "www." and any port. */
export function normalizeHost(host: string | undefined): string {
  if (!host) return "";
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "").slice(0, 120);
}

function byHost(host: string): [string, Channel] | null {
  if (!host) return null;
  for (const [source, channel, suffixes] of HOSTS) {
    if (suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))) return [source, channel];
  }
  // Any other Google property (maps, news, the app's own referrer).
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return ["google", "SEARCH"];
  if (host === "android-app" || host.startsWith("com.google.android")) return ["google", "SEARCH"];
  return null;
}

function channelOfSource(source: string): Channel | null {
  for (const [name, channel] of HOSTS) if (name === source) return channel;
  return null;
}

/** A utm value as a source key: lowercased, safe characters, bounded. */
function cleanTag(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export function classifyVisit(origin: VisitOrigin): Classified {
  const host = normalizeHost(origin.referrer);
  const utmSource = cleanTag(origin.utmSource);
  const utmMedium = cleanTag(origin.utmMedium);
  const known = byHost(host);

  // 1. AI, by host or by tag — before anything else.
  if (known?.[1] === "AI") return { channel: "AI", source: known[0] };
  const tagged = UTM_SOURCES[utmSource];
  if (tagged && channelOfSource(tagged) === "AI") return { channel: "AI", source: tagged };

  // 2. A paid click: an ad id, or a paid utm_medium.
  if (origin.gclid) return { channel: "CAMPAIGN", source: "google-ads" };
  if (PAID_MEDIUM.test(utmMedium)) {
    return { channel: "CAMPAIGN", source: tagged ?? (utmSource || known?.[0] || "campaign") };
  }
  if (origin.fbclid && (!known || known[0] === "facebook" || known[0] === "instagram")) {
    return { channel: "SOCIAL", source: known?.[0] ?? "facebook" };
  }

  // 3. The referring host, when it is one we name.
  if (known) return { channel: known[1], source: known[0] };

  // 4. Tagged but otherwise unknown: a link the team placed (newsletter,
  //    QR code, partner site).
  if (utmSource) {
    const channel = tagged ? channelOfSource(tagged) : null;
    return { channel: channel ?? "CAMPAIGN", source: tagged ?? utmSource };
  }

  // 5. Some other website, or nothing at all.
  if (host) return { channel: "REFERRAL", source: host };
  return { channel: "DIRECT", source: "direct" };
}
