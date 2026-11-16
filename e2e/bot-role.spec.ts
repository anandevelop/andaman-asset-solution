/**
 * e2e/bot-role.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The BOT role, as a bot would use it: signed in with a password alone,
 * free to work across content, SEO, reports and settings — and turned away
 * from customers, co-agents and user accounts, by the menu, by the pages
 * and by the endpoints behind them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { BOT } from "./fixtures";

test.setTimeout(180_000);

test("a bot account works like an administrator, without customers, co-agents or accounts", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Email address").fill(BOT.email);
  await page.getByLabel("Password").fill(BOT.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/en\/admin(?!\/account\/security)/, { timeout: 20_000 });

  // The menu: an administrator's, minus three rows.
  for (const name of ["Site analytics", "SEO", "Reports", "Projects & units", "News", "Settings"]) {
    await expect(page.getByRole("link", { name, exact: true }).first(), name).toBeVisible();
  }
  for (const name of ["Leads & appointments", "Co-agents", "Users & permissions", "Activity"]) {
    await expect(page.getByRole("link", { name, exact: true }), name).toHaveCount(0);
  }

  // The pages themselves refuse, not only the menu.
  for (const path of ["/en/admin/leads", "/en/admin/appointments", "/en/admin/leads/suspect", "/en/admin/agents", "/en/admin/users", "/en/admin/activity", "/en/admin/m"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/en\/admin\?denied=1/);
  }

  // So do the endpoints that hand out customer data.
  expect((await page.request.get("/api/admin/leads/export")).status()).toBe(403);
  expect((await page.request.get("/api/admin/activity/export")).status()).toBe(403);

  // What an administrator can open, it can open.
  for (const path of ["/en/admin/seo", "/en/admin/analytics", "/en/admin/reports", "/en/admin/settings/system", "/en/admin/projects", "/en/admin/news"]) {
    await page.goto(path);
    await expect(page, path).not.toHaveURL(/denied=1/);
    await expect(page.getByText(/something went wrong/i), path).toHaveCount(0);
  }
});
