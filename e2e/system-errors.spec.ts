/**
 * e2e/system-errors.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * An error screen shown in a visitor's browser ends up in the back office:
 * the public endpoint, the error log, the list on Settings › System and
 * the amber row on the connection card. (LINE is not connected in this
 * database, so the row reads "nobody is told" — which is also the truth.)
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { signIn } from "./sign-in";

test.setTimeout(120_000);

test("a browser error is listed on Settings › System", async ({ page, request }) => {
  const message = `E2E checkout widget exploded ${Date.now()}`;

  const sent = await request.post("/api/client-error", {
    data: { name: "TypeError", message, path: "/en/projects/demo?x=1" },
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15" },
  });
  expect(sent.status()).toBe(204);

  // A redirect is not a failure and must not be listed.
  await request.post("/api/client-error", {
    data: { name: "Error", message: "NEXT_REDIRECT", path: "/en" },
    headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15" },
  });

  await page.goto("/en/login");
  await signIn(page);
  await expect(page).toHaveURL(/\/admin/);

  await page.goto("/en/admin/settings/system");
  await expect(page.getByRole("heading", { name: "Recent errors" })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: message });
  await expect(row).toContainText("Browser");
  await expect(row).toContainText("/projects/demo");
  await expect(page.getByText("NEXT_REDIRECT")).toHaveCount(0);

  // Sentry and Redis are gone from the connection card; the error row is there.
  await expect(page.getByText("System error alerts (LINE)")).toBeVisible();
  await expect(page.getByText(/Sentry|Redis/)).toHaveCount(0);

  await page.getByRole("button", { name: "Clear the list" }).click();
  await expect(page.getByText("No errors recorded")).toBeVisible();
});
