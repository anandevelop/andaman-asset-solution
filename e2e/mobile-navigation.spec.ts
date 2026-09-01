/**
 * e2e/mobile-navigation.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The mobile disclosure menu. Runs only in the "mobile" Playwright project,
 * because the whole component is display:none above the lg breakpoint.
 *
 * This spec exists because of what the Phase 11 audit found: the menu had
 * no Escape handler and did not contain focus. It covers the page, so
 * tabbing past its last link walked invisibly into the links underneath —
 * the focus ring disappears and the user is operating controls they cannot
 * see. Neither failure is visible to a sighted mouse user, which is why
 * neither had been noticed, and why they are pinned here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { expectNoA11yViolations } from "./a11y";

test.describe("Mobile navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/en");
  });

  test("opens and closes from the toggle", async ({ page }) => {
    const toggle = page.getByRole("button", { name: "Open menu" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");

    await toggle.click();

    // The same button, relabelled — aria-expanded is what a screen reader
    // announces, and it has to track the actual state.
    const close = page.getByRole("button", { name: "Close menu" });
    await expect(close).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("navigation", { name: "Main, mobile" })).toBeVisible();

    await close.click();
    await expect(page.getByRole("navigation", { name: "Main, mobile" })).toBeHidden();
  });

  test("closes on Escape and returns focus to the toggle", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Main, mobile" })).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.getByRole("navigation", { name: "Main, mobile" })).toBeHidden();

    // Focus must come back to the control that opened it. Dropping it to
    // the top of the document means tabbing through the entire header
    // again to get anywhere.
    await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  });

  test("moves focus into the panel when it opens", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click();

    const firstLink = page
      .getByRole("navigation", { name: "Main, mobile" })
      .getByRole("link")
      .first();

    await expect(firstLink).toBeFocused();
  });

  test("contains focus while it is open", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click();

    const panel = page.getByRole("navigation", { name: "Main, mobile" });
    const focusable = await panel.getByRole("link").count();

    // Tab past the last element in the panel. Without the trap this lands
    // on a link in the page behind, which is covered and invisible.
    for (let i = 0; i < focusable + 4; i += 1) {
      await page.keyboard.press("Tab");
    }

    const inside = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return false;
      const menu = document.getElementById("mobile-nav");
      const toggle = document.querySelector('[aria-controls="mobile-nav"]');
      return Boolean(menu?.contains(active) || toggle === active);
    });

    expect(inside, "focus escaped the open mobile menu").toBe(true);
  });

  test("closes when a link is followed", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click();

    await page
      .getByRole("navigation", { name: "Main, mobile" })
      .getByRole("link", { name: "Projects" })
      .click();

    await expect(page).toHaveURL(/\/en\/projects/);
    // A panel left open over the new page is the classic client-router
    // bug: the header never unmounts, so nothing closes it.
    await expect(page.getByRole("navigation", { name: "Main, mobile" })).toBeHidden();
  });

  test("marks the current section", async ({ page }) => {
    await page.goto("/en/projects");
    await page.getByRole("button", { name: "Open menu" }).click();

    await expect(
      page
        .getByRole("navigation", { name: "Main, mobile" })
        .getByRole("link", { name: "Projects" }),
    ).toHaveAttribute("aria-current", "page");
  });

  test("has no automatically detectable violations while open", async ({ page }) => {
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Main, mobile" })).toBeVisible();

    await expectNoA11yViolations(page);
  });
});

test.describe("Skip link", () => {
  test("is the first thing a keyboard user reaches, and works", async ({ page }) => {
    await page.goto("/en");

    const skip = page.getByRole("link", { name: "Skip to content" });

    /*
      The same hydration gate as the keyboard walk in
      lead-submission.spec.ts: goto() returns once the prerendered HTML has
      loaded, and a Tab pressed before React hydrates is discarded —
      activeElement stays on <body>. Only the production build leaves that
      window open, which is why this passed locally against `next dev` and
      failed under the `next build && next start` that CI runs.

      Retrying the Tab is safe rather than cumulative: focus only moves
      when the press actually takes effect, and the assertion in that same
      attempt is the one that passes.
    */
    await expect(async () => {
      await page.keyboard.press("Tab");
      await expect(skip).toBeFocused({ timeout: 500 });
    }).toPass({ timeout: 15_000 });
    // Hidden until focused, visible once it is — a skip link nobody can
    // see when it has focus is no better than none at all.
    await expect(skip).toBeVisible();

    await page.keyboard.press("Enter");

    await expect(page.locator("#main")).toBeFocused();
  });
});
