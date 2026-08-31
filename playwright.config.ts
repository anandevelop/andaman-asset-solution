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

const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/*
  Env handed to the server under test.

  Deliberately minimal. reCAPTCHA, GA4, Meta Pixel, Sentry and S3 are all
  left unset so their "feature not configured" paths run — which are also
  the paths a first deploy takes, and are therefore worth exercising. A
  test suite that only works with every third-party key present is a test
  suite nobody can run.
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
  // The rate limiter keys on IP. Every request in the suite comes from
  // 127.0.0.1, so the lead and login limits would trip partway through a
  // run and fail tests for a reason that has nothing to do with the code.
  RATE_LIMIT_DISABLED: "1",
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
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
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
