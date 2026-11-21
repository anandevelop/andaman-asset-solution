/**
 * e2e/bot-role.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The BOT role, as a bot would use it: signed in with a password alone and
 * working in the team's place — customers, co-agents, the activity log and
 * exports included — with one door shut: the user accounts, by the menu,
 * by the pages and by going straight at the addresses.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { BOT } from "./fixtures";

test.setTimeout(180_000);

test("a bot account reaches what the owner reaches, except the user accounts", async ({ page }) => {
  await page.goto("/en/login");
  await page.getByLabel("Email address").fill(BOT.email);
  await page.getByLabel("Password").fill(BOT.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/en\/admin(?!\/account\/security)/, { timeout: 20_000 });

  // The menu: the owner's, minus one row.
  // By the start of the name: a row with something waiting carries a count.
  for (const name of ["Site analytics", "SEO", "Reports", "Leads & appointments", "Co-agents", "Projects & units", "News", "Activity", "Settings"]) {
    await expect(page.getByRole("link", { name: new RegExp(`^${name}`) }).first(), name).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Users & permissions", exact: true })).toHaveCount(0);

  // The accounts refuse by address too, list and edit screen alike.
  for (const path of ["/en/admin/users", "/en/admin/users/anything/edit"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/en\/admin\?denied=1/);
  }

  // Everything else opens.
  for (const path of [
    "/en/admin/leads",
    "/en/admin/appointments",
    "/en/admin/leads/suspect",
    "/en/admin/agents",
    "/en/admin/activity",
    "/en/admin/seo",
    "/en/admin/analytics",
    "/en/admin/reports",
    "/en/admin/settings/system",
    "/en/admin/projects",
    "/en/admin/news",
  ]) {
    await page.goto(path);
    await expect(page, path).not.toHaveURL(/denied=1/);
    await expect(page.getByText(/something went wrong/i), path).toHaveCount(0);
  }

  // So do the exports the owner has.
  expect((await page.request.get("/api/admin/leads/export")).status()).toBe(200);
  expect((await page.request.get("/api/admin/activity/export")).status()).toBe(200);
});
