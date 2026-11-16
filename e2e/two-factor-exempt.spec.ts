/**
 * e2e/two-factor-exempt.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "No 2FA for this account" — the switch a super admin sets on one account
 * so a bot can sign in unattended (lib/two-factor-policy.ts).
 *
 * One test, both directions, on the VIEWER fixture: with the switch on, the
 * password alone reaches the back office; with it off again, the code is
 * asked for as before. It ends where it began, because other specs sign in
 * as the same account.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { VIEWER } from "./fixtures";
import { signIn } from "./sign-in";

test.setTimeout(180_000);

test("an exempt account signs in with its password alone, and only while exempt", async ({ page, browser }) => {
  await page.goto("/en/login");
  await signIn(page);
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/en/admin/users");
  const row = page.getByRole("row").filter({ hasText: VIEWER.email });
  await row.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/admin\/users\/.+\/edit/);
  const editUrl = page.url();

  const exempt = page.getByRole("checkbox", { name: /No 2FA for this account/ });
  await expect(exempt).not.toBeChecked();
  await exempt.check();
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Saved").first()).toBeVisible();

  // The list says so, in place of the 2FA status.
  await page.goto("/en/admin/users");
  await expect(page.getByRole("row").filter({ hasText: VIEWER.email })).toContainText("2FA exempt");

  // The bot's side: a fresh browser, the password, and nothing else.
  const bot = await browser.newContext();
  const tab = await bot.newPage();
  await tab.goto("/en/login");
  await tab.getByLabel("Email address").fill(VIEWER.email);
  await tab.getByLabel("Password").fill(VIEWER.password);
  await tab.getByRole("button", { name: /sign in/i }).click();
  await expect(tab).toHaveURL(/\/en\/admin(?!\/account\/security)/, { timeout: 20_000 });
  await expect(tab.getByLabel("Authentication code")).toHaveCount(0);
  await bot.close();

  // Off again: the code is back.
  await page.goto(editUrl);
  await page.getByRole("checkbox", { name: /No 2FA for this account/ }).uncheck();
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Saved").first()).toBeVisible();

  const again = await browser.newContext();
  const second = await again.newPage();
  await second.goto("/en/login");
  await second.getByLabel("Email address").fill(VIEWER.email);
  await second.getByLabel("Password").fill(VIEWER.password);
  await second.getByRole("button", { name: /sign in/i }).click();
  await expect(second.getByLabel("Authentication code")).toBeVisible({ timeout: 20_000 });
  await again.close();
});

test("a super admin's own form offers no such switch", async ({ page }) => {
  await page.goto("/en/login");
  await signIn(page);
  await page.goto("/en/admin/users");
  // Every pool account is a super admin: none of their forms has the switch.
  await page.getByRole("row").filter({ hasText: "e2e-admin-1@andaman.test" }).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/edit/);
  await expect(page.getByRole("checkbox", { name: /No 2FA for this account/ })).toHaveCount(0);
});
