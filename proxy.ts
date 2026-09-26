/**
 * proxy.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Was middleware.ts until Next 16, which renamed the file and the concept:
 * this runs before routing, on every request, and Next now calls that a
 * proxy. Nothing about what it does changed with the name.
 *
 * Two concerns run in one pass, in a deliberate order:
 *
 *   1. Auth gate  — /{locale}/admin/** requires a session. Checked FIRST so
 *      an anonymous request is redirected before next-intl does any locale
 *      rewriting, which keeps the `callbackUrl` clean.
 *   2. Locale     — next-intl handles prefixing and negotiation for
 *      everything that gets through.
 *
 * `getToken` verifies the JWT signature at the edge without touching the
 * database, which is why lib/auth.ts uses a JWT session strategy.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import createMiddleware from "next-intl/middleware";
import { getToken } from "next-auth/jwt";
import { locales, defaultLocale, adminLocales } from "./i18n";
import { roleRequiresTwoFactor } from "./lib/two-factor-policy";
import { identifyBot } from "./lib/seo/bots";
import { recordCrawlHit } from "./lib/seo/crawl-log";
import { stripLocale } from "./lib/public-paths";

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always", // /th/..., /en/...
});

/** Matches /th/admin, /en/admin/leads, … and captures the locale. */
const ADMIN_PATH = new RegExp(`^/(${locales.join("|")})/admin(?:/|$)`);
const LOGIN_PATH = new RegExp(`^/(${locales.join("|")})/login/?$`);
/** The one admin page an account still owing 2FA setup may reach. */
const SECURITY_PATH = new RegExp(
  `^/(${locales.join("|")})/admin/account/security(?:/|$)`,
);

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname, search } = request.nextUrl;

  /*
    Crawl logging — phase 5.

    Placed first because it must observe every request that reaches the
    proxy, including the ones the auth gate is about to redirect: a crawler
    asking for /th/admin is worth seeing, and it never reaches a page.

    Nothing here is awaited. recordCrawlHit returns a promise only when its
    buffer is due to be written, and that promise is handed to
    waitUntil(), which Next keeps alive *after* the response has been sent.
    The visitor's request pays for a Map insert and nothing else — which is
    the whole reason phase 2 measured TTFB before this landed.

    Admin traffic is excluded from the *path* recorded rather than from the
    log: a crawler that reached an admin URL is interesting, but the back
    office's URL structure is not something to accumulate in a table that a
    report reads from.
  */
  const bot = identifyBot(request.headers.get("user-agent"));
  if (bot) {
    const due = recordCrawlHit({
      bot,
      path: pathname.startsWith("/api") ? pathname : stripLocale(pathname),
    });
    if (due) event.waitUntil(due);
  }

  const adminMatch = pathname.match(ADMIN_PATH);
  const loginMatch = pathname.match(LOGIN_PATH);

  if (adminMatch || loginMatch) {
    const locale = (adminMatch ?? loginMatch)![1];

    // The admin backend's own UI only renders in Thai or English (see
    // i18n.ts's adminLocales) — a stray /zh or /ru admin/login link (an old
    // bookmark, a locale cookie left over from the public site) bounces to
    // the same page under Thai rather than rendering an admin nobody reads.
    if (!(adminLocales as readonly string[]).includes(locale)) {
      const url = request.nextUrl.clone();
      url.pathname = `/${defaultLocale}${pathname.slice(locale.length + 1)}`;
      return NextResponse.redirect(url);
    }

    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // Unauthenticated on an admin route → login, remembering where they
    // were headed so the form can bounce them back after sign-in.
    if (adminMatch && !token) {
      const loginUrl = new URL(`/${locale}/login`, request.url);
      loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
      return NextResponse.redirect(loginUrl);
    }

    // Already signed in and asking for the login form → send them onward.
    if (loginMatch && token) {
      return NextResponse.redirect(new URL(`/${locale}/admin`, request.url));
    }

    /*
      Enrolment gate.

      An ADMIN whose account has no authenticator yet is signed in but can
      only reach the setup page. Sending them there beats refusing the
      sign-in outright: they have to be able to get far enough to scan a QR
      code, and the alternative — enrolling people before they ever log in —
      means emailing secrets around.

      The claim comes from the JWT, refreshed every five minutes by the jwt
      callback, so finishing setup releases the gate without a sign-out.
      lib/admin/guard.ts repeats the check server-side; middleware only
      handles the redirect, and a server action never passes through here.
    */
    if (
      adminMatch &&
      token &&
      roleRequiresTwoFactor(token.role as string | undefined) &&
      !token.twoFactorEnabled &&
      !SECURITY_PATH.test(pathname)
    ) {
      return NextResponse.redirect(
        new URL(`/${locale}/admin/account/security?setup=1`, request.url),
      );
    }
  }

  /*
    Carry the resolved pathname to whatever Server Component renders this
    request, via a request header rather than a response header — only the
    `request:` option on NextResponse forwards to the origin's render; a
    header set on the response after the fact only reaches the browser.

    Mutating `request.headers` in place (rather than constructing a fresh
    NextRequest) relies on NextResponse.next()'s documented default: with
    no `request` override, it forwards the incoming request's headers as
    they stand when it runs — so setting this before handing the request to
    next-intl's own middleware is enough, without needing to know or touch
    how that middleware builds its response.

    Exists for app/[locale]/admin/(growth)/layout.tsx, which is the one
    admin zone layout that has to answer "which page, exactly" rather than
    just "which zone" — see the header comment there. If this ever stops
    propagating (a next-intl internal change, a different NextResponse
    path), the layout's read simply comes back empty and it falls back to
    the zone's strict default — failing closed, not open.
  */
  if (adminMatch) {
    request.headers.set("x-admin-pathname", pathname);
  }

  return intlMiddleware(request);
}

export const config = {
  /*
    Skip API routes, Next internals, and static/image assets.

    `monitoring` is Sentry's tunnelRoute (see next.config.js). It is a
    POST-only proxy with no locale of its own, and next-intl's
    `localePrefix: "always"` would answer every error report with a 307 to
    /th/monitoring — turning client-side error reporting into a silent
    no-op exactly when something is already broken.
  */
  matcher: ["/((?!api|monitoring|_next|_vercel|.*\\..*).*)"],
};
