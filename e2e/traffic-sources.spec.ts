/**
 * e2e/traffic-sources.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A visit from ChatGPT that presses "call" ends up on
 * the "Sources & clicks" tab of /admin/analytics as an AI visit with an AI click — the whole
 * path: the beacon on the first page, the delegated click listener, both
 * public endpoints, the day tables and the report.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { signIn } from "./sign-in";

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("a visit from ChatGPT and its call click are counted as AI", async ({ browser, page }) => {
  // A fresh context: its own sessionStorage, so this is a first page.
  const visitor = await browser.newContext();
  const tab = await visitor.newPage();

  // sendBeacon bodies are not visible to Playwright; the report at the end
  // is what proves the source was carried.
  const visit = tab.waitForResponse((response) => response.url().endsWith("/api/page-view"));
  await tab.goto("/en/contact?utm_source=chatgpt.com");
  await visit;

  // Press the first phone link without letting the browser try to dial.
  const click = tab.waitForResponse((response) => response.url().endsWith("/api/click"));
  await tab.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>('a[href^="tel:"]');
    if (!link) throw new Error("no tel: link on /en/contact");
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
  });
  expect((await click).status()).toBe(204);
  await visitor.close();

  await page.goto("/en/login");
  await page.goto("/en/login");
  await signIn(page);
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/en/admin/analytics?tab=sources&range=7");
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sources & clicks" })).toHaveAttribute("aria-pressed", "true");

  // The source row and the AI people list both name ChatGPT.
  await expect(page.getByText("ChatGPT", { exact: true }).first()).toBeVisible();
  const callRow = page.getByRole("row", { name: /^Call/ });
  await expect(callRow).toContainText("1");
});
