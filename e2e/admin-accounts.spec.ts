/**
 * e2e/admin-accounts.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The account and sales-team screens render, and the sales-profile field
 * behaves.
 *
 * WHY THIS EXISTS
 *
 * Nothing in the suite rendered /admin/users. It appears once, in
 * admin-viewer-access.spec.ts, as a route a VIEWER is *refused* — so the
 * page was only ever asserted to redirect, never to draw. Same for
 * /admin/sales-team and the account edit page: no spec loaded either as
 * somebody allowed in.
 *
 * That is the exact shape of gap that has taken this area down three times.
 * A Server Component handing a function to a Client Component compiles,
 * passes the unit suite, and throws at render — /admin/analytics was broken
 * for a week, /admin/seo/audit in production. The only check that catches it
 * is loading the page, and these three now hand UserForm and SalesTeamCards
 * props they did not have before.
 *
 * The second test is the part unit tests genuinely cannot reach: whether the
 * sales-profile field appears and disappears with the role being chosen is
 * client state after hydration, not markup.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { signIn } from "./sign-in";

/*
  Serial, and both sign-ins happen on the English login page — sign-in.ts
  finds its fields by their English labels, and nextAccount()'s cursor is
  module state that two parallel workers would both start from zero. Same
  two facts admin-seo.spec.ts pays for.
*/
test.describe.configure({ mode: "serial" });

test.setTimeout(120_000);

/** The admin error boundary, in either locale. */
const BOUNDARY = /something went wrong|เกิดข้อผิดพลาด/i;

async function signInFresh(page: import("@playwright/test").Page) {
  // Visited twice: locally the suite runs `next dev`, which compiles a route
  // and its client bundle on first request, and whichever spec touches
  // /en/login first otherwise clicks before React has attached.
  await page.goto("/en/login");
  await page.goto("/en/login");

  await signIn(page);
  await expect(page).toHaveURL(/\/admin/);
}

for (const locale of ["en", "th"] as const) {
  test(`the account and sales-team screens render in ${locale}`, async ({ page }) => {
    await signInFresh(page);

    for (const path of ["/admin/users", "/admin/sales-team"]) {
      await page.goto(`/${locale}${path}`);
      await expect(
        page.getByText(BOUNDARY),
        `${locale}${path} hit its error boundary`,
      ).toHaveCount(0);
    }

    /*
      The edit page needs a real id, and taking it from the list's own link
      checks that the link points somewhere that renders — which is the half
      of "a new admin screen works" that a hardcoded id would skip.
    */
    await page.goto(`/${locale}/admin/users`);
    const editHref = await page
      .locator('a[href*="/admin/users/"][href$="/edit"]')
      .first()
      .getAttribute("href");

    expect(editHref, "the users list offered no edit link to follow").toBeTruthy();

    await page.goto(editHref as string);
    await expect(
      page.getByText(BOUNDARY),
      `${editHref} hit its error boundary`,
    ).toHaveCount(0);
  });
}

test("the sales-profile field follows the role being chosen", async ({ page }) => {
  await signInFresh(page);
  await page.goto("/en/admin/users");

  // The create form at the foot of the page, whose role defaults to EDITOR.
  const role = page.locator("#role");
  const salesProfile = page.locator("#salesPersonId");

  await expect(role).toBeVisible();
  await expect(
    salesProfile,
    "EDITOR can be handed a lead, so the field should be offered",
  ).toBeVisible();

  /*
    At least one real profile beside the "not linked" row.

    This is the assertion that keeps the rest of the file honest. With an
    empty roster the select still renders, the page still loads, and every
    check here passes — while the salesPeople prop, which is the thing these
    screens newly carry, is never populated. Proven by mutation: a function
    smuggled into that prop went undetected until global-setup seeded a
    profile for it to be smuggled in.
  */
  await expect(
    salesProfile.locator("option"),
    "the roster fixture is missing, so this spec is not checking the options path",
  ).not.toHaveCount(1);

  /*
    VIEWER is the one role that cannot act on a lead, so it is the one role
    with no profile to link. An absent field submits nothing, which the
    server parses as null — the unlink.
  */
  await role.selectOption("VIEWER");
  await expect(salesProfile).toHaveCount(0);

  await role.selectOption("SALES");
  await expect(salesProfile).toBeVisible();
});
