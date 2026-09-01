/**
 * e2e/harness.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The Playwright `test` these specs use, with one thing added: navigation
 * waits for the page to be interactive, not merely loaded.
 *
 * `page.goto()` resolves on the `load` event. Against a production build
 * that is the moment the prerendered HTML and its subresources have
 * arrived — before React has hydrated it. Anything the test does in that
 * window is dropped on the floor: a click never reaches a handler that
 * does not exist yet, `focus()` does not stick, and keystrokes go nowhere.
 *
 * The failure never says so. It surfaces as "chip stayed aria-pressed
 * false", "phone field is empty", "URL has status= but not type=" — an
 * assertion about the product, on a page that was never listening.
 *
 * Three things made this expensive to find, and are worth writing down:
 *
 *   1. It does not reproduce under `next dev`, which is what the config
 *      runs locally. Compiling each route on first request pushes `load`
 *      well past hydration, so the window does not exist. CI builds for
 *      production, where it does.
 *
 *   2. It does not reproduce with the suite's own timing when a spec is
 *      run on its own — twelve consecutive attempts at the chip click all
 *      passed. It needs the machine to be busy, which is exactly what a
 *      full run (and a CI runner) provides.
 *
 *   3. It lands on a different test each run. Chasing the name in the
 *      report leads to a different innocent test every time.
 *
 * `networkidle` is the gate rather than a hydration marker because there
 * is no reliable public one: React's `__reactContainer` key appears within
 * ~20ms of navigation, long before handlers are attached, so waiting on it
 * proves nothing. Waiting for the network to settle means every chunk the
 * page needs has arrived, which is the part that was still in flight.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    const navigate = page.goto.bind(page);

    page.goto = async (url, options) => {
      const response = await navigate(url, options);

      /*
        Swallowed deliberately. A page that never goes idle is not a reason
        to fail a test that has not made an assertion yet — the assertions
        below have their own timeouts and will report something meaningful.
      */
      await page.waitForLoadState("networkidle").catch(() => {});

      return response;
    };

    await use(page);
  },
});

export { expect };
