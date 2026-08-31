/**
 * middleware.ts
 * ─────────────────────────────────────────────────────────────────────────
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

import { NextResponse, type NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { getToken } from "next-auth/jwt";
import { locales, defaultLocale } from "./i18n";
import { roleRequiresTwoFactor } from "./lib/two-factor-policy";

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

export default async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const adminMatch = pathname.match(ADMIN_PATH);
  const loginMatch = pathname.match(LOGIN_PATH);

  if (adminMatch || loginMatch) {
    const locale = (adminMatch ?? loginMatch)![1];

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

  return intlMiddleware(request);
}

export const config = {
  // Skip API routes, Next internals, and static/image assets
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
