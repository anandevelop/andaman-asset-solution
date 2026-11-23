/**
 * e2e/reveal.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * components/Reveal.tsx wraps most sections of most public pages. It must
 * hide only what starts below the fold: what a visitor can see when the
 * page arrives has to paint with the page, not after the JavaScript.
 *
 * The opposite — every wrapper at opacity 0 until hydration — is easy to
 * reintroduce (one CSS selector) and invisible on a fast machine. On a
 * slow phone it is a header over a blank page for several seconds.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("Revealed sections", () => {
  test("the top of a page is readable with JavaScript switched off", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto("/en/contact");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();
    // toBeVisible() passes at opacity 0; this is the property that hid it.
    const opacity = await heading.evaluate((element) => {
      let lowest = 1;
      for (let node: Element | null = element; node; node = node.parentElement) {
        lowest = Math.min(lowest, Number(getComputedStyle(node).opacity));
      }
      return lowest;
    });
    expect(opacity).toBe(1);

    // And nothing anywhere on the page is left hidden for want of a script.
    const hidden = await page.locator(".reveal").evaluateAll(
      (wrappers) => wrappers.filter((wrapper) => getComputedStyle(wrapper).opacity !== "1").length,
    );
    expect(hidden).toBe(0);
    await context.close();
  });

  test("what is on screen at load is never hidden; what is below still fades in on scroll", async ({ page }) => {
    await page.goto("/en");

    const state = () =>
      page.locator(".reveal").evaluateAll((wrappers) =>
        wrappers.map((wrapper) => {
          const box = wrapper.getBoundingClientRect();
          return {
            onScreenAtLoad: box.top < window.innerHeight && box.left < window.innerWidth,
            armed: wrapper.hasAttribute("data-armed"),
            shown: wrapper.hasAttribute("data-shown"),
          };
        }),
      );

    const atLoad = await state();
    expect(atLoad.length).toBeGreaterThan(3);
    // Nothing on screen was armed, so nothing on screen was ever hidden.
    expect(atLoad.filter((wrapper) => wrapper.onScreenAtLoad && wrapper.armed)).toEqual([]);
    // The sections further down are waiting, hidden, as before.
    const waiting = atLoad.filter((wrapper) => wrapper.armed && !wrapper.shown);
    expect(waiting.length).toBeGreaterThan(0);

    const last = page.locator(".reveal[data-armed]").last();
    await expect(last).toHaveCSS("opacity", "0");
    await last.scrollIntoViewIfNeeded();
    await page.mouse.wheel(0, 300);
    await expect(last).toHaveAttribute("data-shown", "");
    await expect(last).toHaveCSS("opacity", "1");
  });
});
