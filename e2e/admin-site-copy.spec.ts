/**
 * e2e/admin-site-copy.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * /admin/pages/copy, end to end: an override saved in the admin is what
 * the public page renders, a bad placeholder is caught before it can
 * reach the page, and "Use default" brings the built-in copy back.
 *
 * tests/site-copy.test.ts covers the rules; only a real save proves the
 * cache tag is cleared and i18n-request.ts actually lays the row over the
 * JSON — the two links a unit test cannot see.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { nextAccount, signIn } from "./sign-in";

const EDITOR_URL = "/en/admin/pages/copy?key=home.corporate.title";
// The grid's English cell for the key; ids are `cell-<locale>:<key>`.
// The heading is a counted message (=4 / other), which the grid edits as
// one box per case: the first case keeps the cell id, the next gets "-1".
// Both are filled, because which one the home page shows depends on how
// many corporate services exist — the e2e seed has one, so "other". The
// test filled only the first box once the grid split cases, and the home
// page went on showing the untouched "other" case.
const FIELD = '[id="cell-en:home.corporate.title"]';
const FIELD_OTHER = '[id="cell-en:home.corporate.title-1"]';
const SAVE = "Save and publish";

test.describe("Site copy editor", () => {
  test("overrides the corporate heading on the home page, then restores it", async ({ page }) => {
    const heading = `What we do ourselves ${Date.now()}`;

    await page.goto("/en/login");
    await signIn(page, nextAccount().email);

    await page.goto(EDITOR_URL);
    await expect(page.locator(FIELD)).toBeVisible();

    // A placeholder the component never passes is flagged as you type,
    // and Save stays off until it is fixed.
    await page.locator(FIELD).fill("We do {nothing}");
    await expect(page.getByRole("alert").filter({ hasText: "nothing" })).toBeVisible();
    await expect(page.getByRole("button", { name: SAVE })).toBeDisabled();

    await page.locator(FIELD).fill(heading);
    await page.locator(FIELD_OTHER).fill(heading);
    await page.getByRole("button", { name: SAVE }).click();
    await expect(page.getByText("Saved").first()).toBeVisible();

    await page.goto("/en");
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();

    // "Use default" deletes the override.
    await page.goto(EDITOR_URL);
    await expect(page.locator(FIELD)).toHaveValue(heading);
    await expect(page.locator(FIELD_OTHER)).toHaveValue(heading);
    await page.locator('[id="note-en:home.corporate.title"]').getByRole("button", { name: "Use default" }).click();
    await page.getByRole("button", { name: SAVE }).click();
    await expect(page.getByText("Saved").first()).toBeVisible();

    await page.goto("/en");
    await expect(page.getByRole("heading", { name: heading })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /things we do in-house/ })).toBeVisible();
  });
});
