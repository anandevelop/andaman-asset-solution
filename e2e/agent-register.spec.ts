/**
 * e2e/agent-register.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The co-agent registration form stands alone: no navbar, no sales strip,
 * no closing CTA, no footer (BARE_ROUTES in lib/public-paths.ts) — and
 * every other page keeps all of them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { expectNoA11yViolations } from "./a11y";

test("the agent registration page has no site chrome around the form", async ({ page }) => {
  await page.goto("/en/agent/register?ref=nobody");

  await expect(page.getByRole("heading", { level: 1 }).or(page.getByRole("heading", { level: 2 })).first()).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main menu" })).toHaveCount(0);

  // What is left: the logo, and the four languages, which keep the invite.
  await expect(page.getByRole("img", { name: /Andaman Asset/i })).toBeVisible();
  const languages = page.getByRole("navigation", { name: "Language" });
  await expect(languages.getByRole("link")).toHaveCount(4);
  await expect(languages.getByRole("link", { name: "th" })).toHaveAttribute("href", "/th/agent/register?ref=nobody");

  await expectNoA11yViolations(page);
});

test("the form itself is there without an invite link", async ({ page }) => {
  await page.goto("/en/agent/register");
  await expect(page.locator('input[name="name"]')).toBeVisible();
  await expect(page.locator('input[name="notice"]')).toBeVisible();
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
});

test("other pages keep their navbar and footer", async ({ page }) => {
  await page.goto("/en/about");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toBeVisible();
});
