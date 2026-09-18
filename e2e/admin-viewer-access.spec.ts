/**
 * e2e/admin-viewer-access.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Phase 4's read-only role, proven with a real session rather than a
 * source grep.
 *
 * tests/admin/permissions-nav.test.ts checks that the sidebar and the
 * guards agree about who may open a route; it cannot check what the route
 * then renders. A page that opens for VIEWER and still offers a working
 * save button is invisible to that test and to every other unit-level
 * check in this suite — the same reasoning admin-login.spec.ts's own
 * header gives for why authorisation needs a real browser at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { VIEWER } from "./fixtures";
import { DASHBOARD, signIn } from "./sign-in";

async function signInAsViewer(page: import("@playwright/test").Page) {
  await page.goto("/en/login");
  await signIn(page, VIEWER.email, VIEWER.password);
  await expect(page).toHaveURL(/\/en\/admin/);
}

test.describe("VIEWER in the Website Content zone", () => {
  test("opens a (content) page and sees no working save control", async ({ page }) => {
    await signInAsViewer(page);

    await page.goto("/en/admin/news");
    await expect(page).toHaveURL(/\/en\/admin\/news$/);
    await expect(page.getByRole("heading", { name: "News and articles" })).toBeVisible();

    // The "New" link is conditionally rendered on canWrite, not merely
    // disabled — for VIEWER it should not be in the page at all.
    await expect(page.getByRole("link", { name: "Write an article" })).toHaveCount(0);
  });

  test("opens a Pages-hub tab and finds its form disabled, not hidden", async ({ page }) => {
    await signInAsViewer(page);

    await page.goto("/en/admin/pages/about/corporate");
    await expect(page).toHaveURL(/\/en\/admin\/pages\/about\/corporate$/);
    await expect(page.getByRole("heading", { name: "Corporate Services" })).toBeVisible();

    // This form stays in the DOM — <fieldset disabled> is how these pages
    // gate writes without changing the form components themselves — so the
    // control is present but must not be usable.
    const submit = page.getByRole("button", { name: "Create", exact: true });
    await expect(submit).toBeVisible();
    await expect(submit).toBeDisabled();
  });

  test("opens a (catalog) page too — the other zone Phase 4 opened", async ({ page }) => {
    await signInAsViewer(page);

    await page.goto("/en/admin/projects");
    await expect(page).toHaveURL(/\/en\/admin\/projects$/);
    await expect(page.getByRole("heading", { name: "Projects", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "New project" })).toHaveCount(0);
  });
});

test.describe("VIEWER outside the zones Phase 4 opened", () => {
  test("is refused the CRM zone", async ({ page }) => {
    await signInAsViewer(page);

    await page.goto("/en/admin/leads");
    await expect(page).toHaveURL(new RegExp(`${DASHBOARD}\\?denied=1$`));
  });

  test("is refused the System zone", async ({ page }) => {
    await signInAsViewer(page);

    await page.goto("/en/admin/users");
    await expect(page).toHaveURL(new RegExp(`${DASHBOARD}\\?denied=1$`));
  });

  test("is refused the Growth zone", async ({ page }) => {
    await signInAsViewer(page);

    await page.goto("/en/admin/seo");
    await expect(page).toHaveURL(new RegExp(`${DASHBOARD}\\?denied=1$`));
  });
});
