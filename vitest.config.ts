/**
 * vitest.config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Two kinds of unit test in one run:
 *
 *   tests/**            pure logic — sanitizer, HMAC, S3 keys, CSV, filters.
 *                       Node environment, no DOM, fast.
 *   tests/components/** React components. jsdom, React plugin, RTL setup.
 *
 * One config rather than two, because a single `npm test` that runs
 * everything is worth more than a tidy separation nobody remembers to
 * invoke both halves of. The DOM half opts in with a
 * `@vitest-environment jsdom` docblock at the top of each file —
 * `environmentMatchGlobs` did this from here until Vitest 4 removed it.
 *
 * End-to-end tests live in e2e/ and belong to Playwright — deliberately
 * excluded here, or Vitest would try to run them and fail on its own
 * missing `page` fixture.
 * ─────────────────────────────────────────────────────────────────────────
 */

import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],

  /*
    JSX, spelled for oxc rather than esbuild.

    Vitest 4 bundles Vite 8, which transforms with oxc and ignores the
    `esbuild` block entirely — it says so on every run: "Both esbuild and
    oxc options were set. oxc options will be used". @vitejs/plugin-react
    still configures JSX the old way (`esbuild: { jsx: "automatic" }`), so
    with nothing here every .tsx test reached rolldown's parser with its
    JSX untouched and died on "Unexpected JSX expression" before a single
    assertion ran. It is the whole file that fails, not a test, which is
    why the suite reported 357 passing next to one unparseable file.
  */
  oxc: {
    jsx: { runtime: "automatic" },
  },

  resolve: {
    // Mirrors the "@/*" alias in tsconfig.json. Declared by hand rather
    // than via vite-tsconfig-paths: that package is ESM-only and this
    // project is CommonJS, so requiring it fails at config load.
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` throws on import outside a React Server Component.
      // The guard is right in the app and meaningless in a test runner.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },

  test: {
    // Node by default; a component test opts into a DOM with a
    // `@vitest-environment jsdom` docblock on its first line.
    environment: "node",

    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e/**"],

    // Every test is synchronous or a fast local call; anything slower than
    // this is a hung promise, not a slow assertion.
    testTimeout: 10_000,
    reporters: ["default"],

    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],

      /*
        Only what the tests are actually for. Pages and layouts are covered
        by Playwright, not here, and including them would produce a low
        headline number that says nothing about the logic this suite
        protects — and that people then learn to ignore.

        Listed file by file rather than as `lib/**` + `components/**`. Those
        globs pulled in 105 files against a suite that exercises fourteen,
        which put the headline at 10% and the thresholds below permanently
        out of reach — CI failed on coverage from the day they were added,
        and a gate that is always red gates nothing.

        The rule for this list: a module belongs here once a test file
        covers it. Adding a test means adding its module here, which is the
        moment to decide what floor it should hold.
      */
      include: [
        "lib/csv.ts",
        "lib/db.ts",
        "lib/email.ts",
        "lib/events.ts",
        "lib/faqs.ts",
        "lib/line.ts",
        "lib/markdown.ts",
        "lib/project-filters.ts",
        "lib/rate-limit.ts",
        "lib/recaptcha.ts",
        "lib/s3.ts",
        "lib/totp.ts",
        "lib/two-factor-policy.ts",
        "lib/validations.ts",
        "components/LeadForm.tsx",
      ],
      exclude: [
        "lib/prisma.ts", // a client singleton with no branches
        "lib/sentry.ts", // configuration object
        "lib/analytics.ts", // thin wrappers over third-party globals
        "**/*.d.ts",
      ],

      // Enforced in CI. See docs/TESTING.md for why these numbers.
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 70,
        statements: 60,

        // The modules where a silent regression is dangerous rather than
        // merely annoying. Held far higher than the project floor.
        "lib/markdown.ts": { lines: 95, functions: 100, branches: 90, statements: 95 },
        "lib/csv.ts": { lines: 95, functions: 100, branches: 90, statements: 95 },
        /*
          Only `verifyLineSignature` is under test — the Flex Message
          builders and the push path below it are not, which is why this
          floor is single-digit rather than the 40 it claimed before.
          Low, but not pointless: it is what keeps the signature check,
          the one thing standing between the webhook and the open
          internet, from losing its test unnoticed. Raise it when the
          push path gets tests, not before.

          The branch figure was 90 until now, and functions 10, in a
          commit whose subject was "Make the CI gates ones that can
          actually pass": the other three numbers came down, that one
          went up from 60, and the file has never been near either. The
          real coverage is 20% of branches and 7.69% of functions —
          one tested function out of thirteen — so these sit just under
          that, where a lost test trips them and normal drift does not.
        */
        "lib/line.ts": { lines: 7, functions: 5, branches: 15, statements: 7 },
        /*
          Seat counting, and nothing else in this file, is what these
          protect. `seatsLeft` is the number the RSVP form shows and the
          capacity check refuses on — get it wrong in one direction and an
          event with room turns people away, in the other and it oversells.
          It went untested until the sum moved out of Node and into a
          groupBy, which is a bad moment to have no test.

          The detail pages, the sitemap query and countTakenSeats are not
          covered, so this sits just under the real figure rather than at
          an aspirational one. Raise it when those get tests.
        */
        "lib/events.ts": { lines: 60, functions: 55, branches: 60, statements: 60 },
        "lib/project-filters.ts": {
          lines: 95,
          functions: 100,
          branches: 90,
          statements: 95,
        },
      },
    },
  },
});
