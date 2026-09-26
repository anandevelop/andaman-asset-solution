/**
 * playwright.config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * End-to-end tests. These run against a real Next server talking to a real
 * Postgres, because the three journeys they cover — submitting an enquiry,
 * signing in to the back office, filtering the project list — each cross a
 * boundary that a unit test mocks away, and the mocks are precisely where
 * the bugs hide.
 *
 * THE DATABASE IS SEPARATE AND IS WIPED.
 *
 * e2e/global-setup.ts truncates every table before seeding fixtures, so
 * pointing E2E_DATABASE_URL at a database that holds anything you want to
 * keep will destroy it. The setup refuses to run against DATABASE_URL for
 * that reason. See docs/TESTING.md.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

/*
  Nothing else in this pipeline loads `.env`.

  Playwright's config file and `tsx e2e/global-setup.ts` are plain Node
  processes — only `next dev` / `next build` / `next start` get Next's
  automatic env loading. Without this call, E2E_DATABASE_URL (and anything
  else set only in .env) never reaches `process.env` here, so SERVER_ENV
  below silently falls back to `""`. The server this file spawns then
  crashes at Prisma-client construction — `lib/prisma.ts` builds a
  PrismaClient at module scope, and `env("DATABASE_URL")` resolving to ""
  throws before any request, before any query, and before safeQuery ever
  gets a chance to degrade it. What Playwright reports is just "Process
  from config.webServer was not able to start. Exit code: 1" — the actual
  cause never makes it to a log line.
*/
loadEnvConfig(process.cwd());

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/*
  Env handed to the server under test.

  Deliberately minimal. Third-party integrations are meant to be absent so
  their "feature not configured" paths run — which are also the paths a
  first deploy takes, and are therefore worth exercising. A test suite that
  only works with every third-party key present is a test suite nobody can
  run.

  Absent has to be spelled out, not assumed. Playwright merges this object
  over the parent environment rather than replacing it, and `next dev` then
  runs loadEnvConfig itself, so every key in a developer's .env reaches the
  server under test unless something here overrides it.

  reCAPTCHA is the case that bit. With NEXT_PUBLIC_RECAPTCHA_SITE_KEY set
  locally the widget mounted for real, and axe — which scans into iframes —
  failed both lead-form accessibility specs on the contrast of Google's own
  red text inside iframe[title="reCAPTCHA"]: #ff0000 on #f9f9f9, 3.79:1
  against a required 4.5. Not markup we own, not markup we can change, and
  green on CI, where no .env file exists — a local-only failure with no
  bug behind it.

  An empty string is what fixes it, because an empty string is *defined*:
  @next/env fills in a key only when it was undefined as the process
  started, so .env cannot put the value back afterwards.

  Sentry, Meta Pixel and DO Spaces are left inherited rather than forced.
  No spec depends on their absence today, and clearing them would change
  behaviour this suite does not currently assert on.
*/
/*
  One secret, shared by both halves of the run.

  global-setup.ts encrypts the fixture's TOTP secret with
  process.env.NEXTAUTH_SECRET — lib/totp derives its AES key from it — while
  the server under test decrypts with whatever this config hands it. When
  the two differ, the database holds ciphertext the application cannot read:
  sign-in logs "[2fa] cannot decrypt TOTP secret" and every admin spec times
  out at the code prompt, for a reason that looks nothing like a key
  mismatch. Writing the resolved value back onto process.env is what keeps
  the setup side in step — and it lets a local run work without exporting
  anything.
*/
const NEXTAUTH_SECRET =
  process.env.E2E_NEXTAUTH_SECRET ??
  process.env.NEXTAUTH_SECRET ??
  "e2e-only-secret-not-for-production";

process.env.NEXTAUTH_SECRET = NEXTAUTH_SECRET;

const SERVER_ENV = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
  NEXTAUTH_URL: BASE_URL,
  NEXTAUTH_SECRET,
  NEXT_PUBLIC_SITE_URL: BASE_URL,
  NEXT_PUBLIC_DEFAULT_LOCALE: "th",
  NEXT_TELEMETRY_DISABLED: "1",
  /*
    Off for the run, not merely unconfigured.

    Both halves are cleared together so isRecaptchaConfigured() is
    consistently false: lib/recaptcha skips verification when either key is
    missing, RecaptchaProvider renders nothing without the site key, and
    the form posts a null token, which app/api/leads already accepts.
  */
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY: "",
  RECAPTCHA_SECRET_KEY: "",
  // The rate limiter keys on IP. Every request in the suite comes from
  // 127.0.0.1, so the lead and login limits would trip partway through a
  // run and fail tests for a reason that has nothing to do with the code.
  RATE_LIMIT_DISABLED: "1",
  /*
    The suite tests the indexable site, which is the one that matters.

    lib/indexing.ts blocks unless SITE_INDEXABLE is exactly "true" — a
    deliberately unsafe-to-forget default, so staging cannot accidentally
    be indexed. Unset here, every page carries "noindex, nofollow" and two
    tests in project-listing-filter.spec.ts stop meaning anything: the one
    asserting the unfiltered listing stays indexable fails, and — worse —
    the one asserting filtered pages are kept *out* of the index passes
    whatever the code does, including with the filter logic deleted.

    Set to "true" so both sides of that distinction are exercised.
  */
  SITE_INDEXABLE: "true",
};

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",

  // Generous: the first request to a route in dev triggers a compile.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  // Serial. The suite writes leads and reads them back, and the login spec
  // depends on a known session state — parallel workers sharing one
  // database would make both flaky in ways that look like real failures.
  workers: 1,
  fullyParallel: false,

  // No retries locally: a test that only passes on the second attempt is
  // telling you something, and hiding it is how a suite stops being
  // trusted. One retry in CI, where genuine infrastructure flakes exist.
  retries: process.env.CI ? 1 : 0,

  // A stray test.only in a pull request should fail the build, not quietly
  // skip everything else.
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    // Artefacts only for failures — a full-run trace of a green suite is
    // hundreds of megabytes nobody opens.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "en-GB",
    timezoneId: "Asia/Bangkok",
    /*
      Every framer-motion element on this site (Reveal, ProjectsHero, the
      mobile nav's staggered links) reads prefers-reduced-motion itself —
      see the note in components/Reveal.tsx — and jumps straight to its
      final state when it is set, no MotionConfig wiring needed on our
      side.

      Without this, axe-core can scan an eyebrow or a heading mid fade-in
      and flag it for a contrast ratio that only exists for the ~700ms
      the animation is still running — ProjectsHero's eyebrow is exactly
      that: accent-700 at its resting 4.84:1 read as 3.83:1 because the
      scan landed at ~88% opacity. That is a real thing a reduced-motion
      visitor's browser produces too, so exercising this path is not a
      workaround bought at the suite's expense — it is the same state
      real users in that setting see instead of the animation.
    */
    contextOptions: { reducedMotion: "reduce" },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      /*
        The mobile spec belongs to the project below, and only there.
        Without this it also ran at 1280px, where the hamburger carries
        `lg:hidden`, so every one of its tests sat waiting sixty seconds for
        an "Open menu" button that is not rendered at that width — five
        failures describing the viewport they were handed rather than
        anything about the code.
      */
      testIgnore: /mobile-navigation\.spec\.ts/,
    },
    {
      // The mobile viewport is not decoration: the nav collapses to a
      // disclosure with its own focus trap, and roughly three quarters of
      // this site's traffic arrives on a phone.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile-navigation\.spec\.ts/,
    },
  ],

  webServer: {
    /*
      Production build in CI, dev server locally.

      The difference matters for what is being tested: `next build` is
      where ISR, route segment config and the standalone output actually
      take effect, and a page that renders in dev can still fail to
      prerender. Locally the six-minute build would mean nobody runs these
      before pushing, which is worse.
    */
    command: process.env.CI
      ? `npm run build && npx next start -p ${PORT}`
      : `npx next dev -p ${PORT}`,
    /*
      Readiness is checked against a page, not /api/health.

      Health returns 503 when the database is unreachable — a correct
      answer, and one Playwright reads as "not ready yet", so it would wait
      out the full timeout on exactly the setup problem you most want
      reported quickly. The English homepage returns 200 either way,
      because the data layer degrades to empty states rather than throwing.
    */
    url: `${BASE_URL}/en`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: SERVER_ENV,
  },
});
