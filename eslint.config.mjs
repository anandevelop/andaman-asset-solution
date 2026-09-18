/**
 * eslint.config.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Replaces .eslintrc.json, which ESLint 10 no longer reads — flat config is
 * the only format left. The rules are unchanged from the eslintrc this was
 * translated from; only the shape moved.
 *
 * `npm run lint` no longer goes through `next lint` either: Next 16 removed
 * that wrapper in favour of calling ESLint directly, which is what the
 * script now does. The one thing the wrapper did for free was know which
 * directories to look in, so the script passes them explicitly — add a new
 * top-level source folder and it needs adding there too.
 *
 * eslint-config-next 16 ships flat config already, so it is spread in
 * directly. Going through @eslint/eslintrc's FlatCompat — the usual bridge
 * for an eslintrc-style shareable config — fails on it outright: the
 * validator tries to JSON.stringify a config whose plugin objects
 * reference each other, and dies on the cycle rather than reporting
 * anything useful.
 * ─────────────────────────────────────────────────────────────────────────
 */

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default [
  {
    /*
      Flat config has no `ignorePatterns` — ignores are a config object of
      their own, and one containing only `ignores` applies globally.

      Everything here was in the eslintrc's ignorePatterns except the build
      and coverage output, which the old `next lint` wrapper knew to skip
      on its own and a bare `eslint` call does not.
    */
    ignores: [
      "node_modules/**",
      ".next/**",
      "coverage/**",
      "public/**",
      "next-env.d.ts",
      "*.config.js",
      "*.config.mjs",
    ],
  },

  ...nextCoreWebVitals,

  {
    /*
      The React Compiler rule set, which eslint-config-next 16 turns on as
      errors. It found 47 things in code that has been running correctly for
      months, and they are not one kind of finding:

        · react-hooks/refs (9) is the "latest ref" idiom — assigning
          ref.current during render so a debounced callback fires the newest
          closure instead of a stale one. Every site says so in a comment
          above it. Left as an error, with a disable and a reason at each
          one, so the rule still catches the case where somebody reaches for
          a ref during render without that reason.

        · set-state-in-effect (23), static-components (8) and immutability
          (2) are warnings below. These flag real costs — extra renders,
          components redefined per parent render — but each one needs
          reading in context, and several are deliberate: reading
          localStorage after mount, for instance, is how this codebase
          avoids a hydration mismatch, which is the more serious bug.

      Warnings, not "off": the findings stay in the output, and the next
      person to touch one of those files sees it.
    */
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",

      "@next/next/no-img-element": "warn",

      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > Identifier[name='prisma']",
          message:
            "`prisma as any` turns off type-checking for the whole query. It was added when the generated client genuinely predated the schema; that stopped being true, and the cast still spread to 36 files and hid a real typing question about Json? columns. Run `npx prisma generate` and write the query untyped-cast-free. If the client really is stale, fix the client.",
        },
      ],
    },
  },

  {
    /*
      e2e/ is Playwright, not React. Its fixtures destructure a `page`
      argument and call helpers on it, and the hooks rules read that as a
      component called `page` calling a hook called `use` — a rule firing on
      code that has never rendered anything.
    */
    files: ["e2e/**"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },

  {
    /*
      Server Components render once per request, on the server. Reading the
      clock there is not an impurity — it is the point: a page rendered now
      shows now's data. The purity rule is written for client components,
      where a render can be repeated or replayed and the same input has to
      give the same output.

      Scoped to the App Router's own files rather than switched off
      globally, so a client component that reaches for Date.now() during
      render still gets caught. (UrlRedirectManager did, and it was a real
      hydration mismatch.)
    */
    files: ["app/**/page.tsx", "app/**/layout.tsx", "app/**/route.ts"],
    rules: {
      "react-hooks/purity": "off",
    },
  },
];
