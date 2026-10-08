/**
 * lib/club/edge.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ANDAMAN CLUB routing for proxy.ts. Edge-safe: no Node or Prisma imports.
 *
 * member.andamanassetsolution.com serves only the portal:
 *   /                 → /<locale>/club
 *   /<rp|tv|vc>/<t>   → /<locale>/club/c/<code>/<t>   (card scan)
 *   /r/<t>            → /<locale>/club/c/r/<t>        (legacy test cards)
 *   /<anything>       → /<locale>/club/<anything>
 * The locale comes from the NEXT_LOCALE cookie, else Thai. The URL the
 * resident sees never carries a locale or "/club".
 *
 * On the main domain /<locale>/club is 404 in production (it is reachable
 * on localhost for development), and a card link opened there is sent to
 * the member host.
 *
 * Crawlers, AI scrapers and chat link-preview bots get a bare 404 on every
 * portal URL — nothing to index or summarise, and the scan is not logged.
 * The LINE / WeChat / Yandex / Baidu in-app browsers residents really use
 * are deliberately not matched.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { NextResponse, type NextRequest } from "next/server";
import { memberHost } from "./constants";

const LOCALES = ["th", "en", "zh", "ru"];
const CARD_PATH = /^\/(rp|tv|vc|r)\/([0-9A-Za-z]{16,32})\/?$/;
const MAIN_CLUB_PATH = /^\/(th|en|zh|ru)\/club(?:\/|$)/;

const BOT_UA =
  /bot\b|bot\/|crawl|spider|slurp|preview|facebookexternalhit|meta-externalagent|line-poker|whatsapp\/|embedly|quora link|vkshare|bytespider|petalbot|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexity|ccbot|amazonbot|applebot|ahrefs|semrush|mj12|dotbot|headlesschrome|python-requests|curl\/|wget|go-http-client/i;

const PRIVATE_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet, noimageindex",
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export function isMemberHost(request: NextRequest): boolean {
  const host = (request.headers.get("host") ?? "").toLowerCase();
  return host.startsWith("member.") || (!!process.env.CLUB_DEV_HOST && host === process.env.CLUB_DEV_HOST);
}

// A body and a content type: a bodiless 404 with no type is offered as a
// download by some browsers when it answers a navigation.
const NOT_FOUND_HTML = '<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>404</title><p>Not found</p>';

function notFound(): NextResponse {
  return new NextResponse(NOT_FOUND_HTML, {
    status: 404,
    headers: { ...PRIVATE_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

function localeOf(request: NextRequest): string {
  const cookieLocale = request.cookies.get("NEXT_LOCALE")?.value ?? "";
  return LOCALES.includes(cookieLocale) ? cookieLocale : "th";
}

function withPrivateHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key, value);
  return response;
}

/**
 * Returns a response when the request belongs to the club (member host,
 * a card link on the main domain, or /<locale>/club), otherwise null and
 * proxy.ts carries on as before.
 */
export function clubProxy(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const member = isMemberHost(request);
  const cardOnMain = !member && CARD_PATH.test(pathname);
  const clubOnMain = !member && MAIN_CLUB_PATH.test(pathname);
  if (!member && !cardOnMain && !clubOnMain) return null;

  const ua = request.headers.get("user-agent") ?? "";
  if (!ua || BOT_UA.test(ua)) return notFound();

  // Shared-host mode (testing): CLUB_MEMBER_HOST is this very host, e.g.
  // 168-144-240-9.sslip.io, so cards print https://<host>/rp/<token> and
  // the portal lives under /<locale>/club on the same domain — no extra
  // subdomain or proxy entry needed.
  const host = (request.headers.get("host") ?? "").toLowerCase().split(":")[0];
  const sharedHost = host === memberHost();

  if (cardOnMain) {
    if (sharedHost) {
      const card = pathname.match(CARD_PATH)!;
      const url = request.nextUrl.clone();
      url.pathname = `/${localeOf(request)}/club/c/${card[1]}/${card[2]}`;
      return withPrivateHeaders(NextResponse.rewrite(url));
    }
    const target = new URL(`https://${memberHost()}${pathname}`);
    return withPrivateHeaders(NextResponse.redirect(target, 308));
  }
  if (clubOnMain) {
    // Production serves the portal on member.* only, unless this host is
    // the configured member host or CLUB_ALLOW_MAIN_HOST is set.
    if (process.env.NODE_ENV === "production" && !sharedHost && !process.env.CLUB_ALLOW_MAIN_HOST) return notFound();
    return withPrivateHeaders(NextResponse.next());
  }

  // member host
  if (/^\/(admin|login)(\/|$)/.test(pathname) || /^\/(th|en|zh|ru)\/(admin|login)(\/|$)/.test(pathname)) return notFound();
  if (MAIN_CLUB_PATH.test(pathname)) return withPrivateHeaders(NextResponse.next());

  const locale = localeOf(request);
  const url = request.nextUrl.clone();
  const card = pathname.match(CARD_PATH);
  url.pathname = card
    ? `/${locale}/club/c/${card[1]}/${card[2]}`
    : pathname === "/" ? `/${locale}/club` : `/${locale}/club${pathname.replace(/\/$/, "")}`;
  return withPrivateHeaders(NextResponse.rewrite(url));
}
