/**
 * tests/seo/bots.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Telling crawlers apart, and telling them from people.
 *
 * Two failure modes, and the second is much worse than the first. Missing
 * a crawler leaves the crawl figures incomplete. Filing a *person* as a
 * bot puts real visitors in the crawl report and takes them out of the
 * traffic one — so the agents below include the ones that trip a naive
 * substring test: Cubot phones, and every desktop browser string that
 * happens to contain "bot" inside a longer word.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { identifyBot, isBot, SEARCH_BOTS, BOTS } from "@/lib/seo/bots";

describe("identifyBot", () => {
  const cases: [string, string][] = [
    [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "googlebot",
    ],
    [
      "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "googlebot",
    ],
    [
      "Googlebot-Image/1.0",
      "googlebot-image",
    ],
    [
      "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
      "google-inspectiontool",
    ],
    [
      "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      "bingbot",
    ],
    ["Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", "yandexbot"],
    ["Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)", "baiduspider"],
    ["Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", "ahrefsbot"],
    ["facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)", "facebookbot"],
    ["Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)", "gptbot"],
    ["Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "claudebot"],
  ];

  for (const [agent, expected] of cases) {
    it(`reads ${expected} from its own agent string`, () => {
      expect(identifyBot(agent)).toBe(expected);
    });
  }

  it("does not file Googlebot-Image under plain Googlebot", () => {
    // Both strings contain "googlebot". Order in the pattern list is what
    // keeps them apart, so it is asserted rather than left to chance.
    expect(identifyBot("Googlebot-Image/1.0")).toBe("googlebot-image");
    expect(identifyBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe("googlebot");
  });

  it("files an unnamed crawler under other", () => {
    expect(identifyBot("Mozilla/5.0 (compatible; SomeNewBot/1.0)")).toBe("other");
    expect(identifyBot("my-little-crawler/0.1")).toBe("other");
    expect(identifyBot("Mozilla/5.0 (compatible; Screaming Frog SEO Spider/19.0)")).toBe("other");
  });

  it("does not mistake a person for a crawler", () => {
    const people = [
      // The one that catches a bare /bot/ test: a Cubot phone.
      "Mozilla/5.0 (Linux; Android 11; CUBOT NOTE 20) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
      "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36",
    ];

    for (const agent of people) {
      expect(identifyBot(agent), agent.slice(0, 50)).toBeNull();
    }
  });

  it("treats a missing user agent as a person, not a bot", () => {
    // A request with no agent is more often a health check or a scripted
    // client than a crawler, and guessing "bot" would quietly move it out
    // of the traffic figures.
    expect(identifyBot(null)).toBeNull();
    expect(identifyBot(undefined)).toBeNull();
    expect(identifyBot("")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(identifyBot("GOOGLEBOT/2.1")).toBe("googlebot");
    expect(identifyBot("BingBot/2.0")).toBe("bingbot");
  });
});

describe("isBot", () => {
  it("agrees with identifyBot", () => {
    expect(isBot("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126")).toBe(false);
  });
});

describe("the bot list", () => {
  it("names every bot the patterns can return", () => {
    // A pattern returning a name the list does not carry would produce a
    // row the screen cannot label.
    const agents = [
      "Googlebot/2.1", "Googlebot-Image/1.0", "Google-InspectionTool/1.0", "GoogleOther",
      "bingbot/2.0", "YandexBot/3.0", "Baiduspider/2.0", "DuckDuckBot/1.0", "Applebot/0.1",
      "facebookexternalhit/1.1", "Twitterbot/1.0", "LineSpider/1.0", "AhrefsBot/7.0",
      "SemrushBot/7", "MJ12bot/v1.4.8", "DotBot/1.2", "PetalBot", "GPTBot/1.1",
      "ClaudeBot/1.0", "PerplexityBot/1.0", "Bytespider", "unknown-crawler/1",
    ];

    for (const agent of agents) {
      const name = identifyBot(agent);
      expect(name, agent).not.toBeNull();
      expect(BOTS, agent).toContain(name);
    }
  });

  it("lists only real bots as search crawlers", () => {
    for (const bot of SEARCH_BOTS) expect(BOTS).toContain(bot);
    // Scrapers and preview fetchers say nothing about search.
    for (const notSearch of ["ahrefsbot", "gptbot", "facebookbot", "other"] as const) {
      expect(SEARCH_BOTS).not.toContain(notSearch);
    }
  });
});
