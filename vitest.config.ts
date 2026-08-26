/**
 * vitest.config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Two kinds of unit test in one run:
 *
 *   tests/**            pure logic — sanitizer, HMAC, S3 keys, CSV, filters.
 *                       Node environment, no DOM, fast.
 *   tests/components/** React components. jsdom, React plugin, RTL setup.
 *
 * They are split by `environmentMatchGlobs` rather than two config files,
 * because a single `npm test` that runs everything is worth more than a
 * tidy separation nobody remembers to invoke both halves of.
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
    // Node by default; component tests opt into a DOM.
    environment: "node",
    environmentMatchGlobs: [["tests/components/**", "jsdom"]],

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
      */
      include: ["lib/**/*.ts", "components/**/*.tsx"],
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
        "lib/line.ts": { lines: 40, functions: 30, branches: 60, statements: 40 },
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
