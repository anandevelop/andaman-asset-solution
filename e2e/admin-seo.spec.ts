/**
 * e2e/admin-seo.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Every SEO and reporting screen renders at all.
 *
 * WHY THIS EXISTS
 *
 * Three times now, a Server Component in this area has handed a function
 * to a Client Component — a label formatter, an href builder — and taken
 * the whole page down with "Functions cannot be passed directly to Client
 * Components". Each time TypeScript was happy, the unit suite was green,
 * and the screen 404'd for real users: /admin/analytics for a week,
 * /admin/seo/keywords in development, /admin/seo/audit in production.
 *
 * Nothing in this repository catches that except loading the page, so
 * every page in this area gets loaded. The assertion is deliberately
 * shallow — the numbers on these screens are unit-tested — and the
 * coverage deliberately wide: it exists to prove the screen exists.
 *
 * Both locales, because a render error can come out of one message file's
 * shape and not another's.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { signIn } from "./sign-in";

/** Every screen in the SEO hub, plus the report it feeds. */
const PAGES = [
  "/admin/seo",
  "/admin/seo/audit",
  "/admin/seo/audit?rule=meta-description",
  "/admin/seo/indexing",
  "/admin/seo/keywords",
  "/admin/seo/links",
  "/admin/seo/urls",
  "/admin/seo/defaults",
  "/admin/reports",
];

/*
  Serial, and both sign-ins happen on the English login page — sign-in.ts
  finds its fields by their English labels, and nextAccount()'s cursor is
  module state that two parallel workers would both start from zero.
  See admin-analytics.spec.ts, which pays for the same two facts.
*/
test.describe.configure({ mode: "serial" });

test.setTimeout(120_000);

for (const locale of ["en", "th"] as const) {
  test(`every SEO screen renders in ${locale}`, async ({ page }) => {
    // Visited twice: locally the suite runs `next dev`, which compiles a
    // route and its client bundle on first request, and whichever spec
    // touches /en/login first otherwise clicks before React has attached.
    await page.goto("/en/login");
    await page.goto("/en/login");

    await signIn(page);
    await expect(page).toHaveURL(/\/admin/);

    for (const path of PAGES) {
      await page.goto(`/${locale}${path}`);

      /*
        The admin error boundary, which is what a server render error
        produces here: the route still answers 200 with a working shell
        and the boundary inside it, so asserting on the status code would
        miss every bug this file exists for.
      */
      await expect(
        page.getByText(/something went wrong|เกิดข้อผิดพลาด/i),
        `${locale}${path} hit its error boundary`,
      ).toHaveCount(0);
    }
  });
}
