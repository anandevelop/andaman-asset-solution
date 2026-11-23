/**
 * e2e/cookie-banner.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The cookie banner is rendered on the server, so a first visit paints it
 * with the page rather than after the JavaScript — on a text page it is
 * the largest thing on a phone's screen, and it used to hold the page's
 * Largest Contentful Paint until hydration.
 *
 * That only works if a returning visitor never sees it, and the thing
 * that guarantees that is an inline script and one CSS rule: neither is
 * type-checked, and both fail silently (a banner flashing on every page).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";

const BANNER = '[data-cookie-banner]';

test.describe("The cookie banner", () => {
  test("is in the page's HTML, before any script has run", async ({ request }) => {
    const html = await (await request.get("/en/contact")).text();
    expect(html).toContain('data-cookie-banner="auto"');
    expect(html).toContain("Reject non-essential");
    // And the script that hides it for a returning visitor comes first.
    expect(html.indexOf("data-cookie-decided")).toBeGreaterThan(-1);
    expect(html.indexOf("data-cookie-decided")).toBeLessThan(html.indexOf('data-cookie-banner="auto"'));
  });

  test("shows on a first visit with JavaScript switched off", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/en/contact");
    await expect(page.locator(BANNER)).toBeVisible();
    await context.close();
  });

  test("a decision closes it, and it never paints again on later pages", async ({ page }) => {
    await page.goto("/en/contact");
    await expect(page.locator(BANNER)).toBeVisible();
    await page.getByRole("button", { name: "Reject non-essential" }).click();
    await expect(page.locator(BANNER)).toHaveCount(0);

    // Watch the next load from its first frame: the banner is in the HTML,
    // so "not visible at the end" would also pass for a banner that
    // flashed. Record whether it was ever displayed.
    await page.addInitScript(() => {
      (window as unknown as { __bannerSeen: boolean }).__bannerSeen = false;
      const check = () => {
        const banner = document.querySelector("[data-cookie-banner]");
        if (banner && getComputedStyle(banner).display !== "none") {
          (window as unknown as { __bannerSeen: boolean }).__bannerSeen = true;
        }
      };
      new MutationObserver(check).observe(document, { childList: true, subtree: true, attributes: true });
      const tick = () => {
        check();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });

    await page.goto("/en/about");
    await expect(page.locator("html")).toHaveAttribute("data-cookie-decided", "");
    await expect(page.locator(BANNER)).toBeHidden();
    expect(await page.evaluate(() => (window as unknown as { __bannerSeen: boolean }).__bannerSeen)).toBe(false);
  });

  test("the footer link reopens it for a visitor who has decided", async ({ page }) => {
    await page.goto("/en/contact");
    await page.getByRole("button", { name: "Accept all" }).click();
    await page.reload();
    await expect(page.locator(BANNER)).toBeHidden();

    await page.getByRole("button", { name: "Cookies Preferences" }).click();
    await expect(page.locator(BANNER)).toBeVisible();
    await expect(page.locator(BANNER)).toHaveAttribute("data-cookie-banner", "asked");
    // Pre-filled with what was chosen.
    await expect(page.getByRole("checkbox", { name: /Analytics/i })).toBeChecked();

    await page.getByRole("button", { name: "Save preferences" }).click();
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("a decision made under an older policy version is asked again", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "andaman-cookie-consent",
        JSON.stringify({ analytics: true, marketing: true, version: "an-older-version", decidedAt: "2026-01-01T00:00:00.000Z" }),
      );
    });
    await page.goto("/en/contact");
    await expect(page.locator(BANNER)).toBeVisible();
  });
});
