/**
 * e2e/admin-login.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Signing in to the back office, and being kept out of it.
 *
 * Authorisation is the one area where a passing unit test is least
 * reassuring, because the failure mode is a route that renders when it
 * should have redirected — and nothing else on the page looks wrong. Only
 * a real request through the real middleware, carrying a real cookie,
 * settles it.
 *
 * The negative cases matter more than the positive one. A broken login is
 * reported within the hour; a leaking guard is not reported at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test, type Page } from "@playwright/test";
import { generate } from "otplib";
import { expectNoA11yViolations } from "./a11y";
import { ADMIN } from "./fixtures";

const LOGIN = "/en/login";
const DASHBOARD = "/en/admin";

/** Length of one TOTP step, and therefore of one code. */
const STEP_MS = 30_000;

/** Fresh code from the fixture secret — the same one the seed enrolled. */
function currentCode(): Promise<string> {
  return generate({ secret: ADMIN.totpSecret });
}

/**
 * A code is refused once it has been spent (lib/totp.ts burns the time
 * step), so two sign-ins inside the same 30 seconds cannot reuse one.
 * Waiting for the next window is the honest fix; the alternative — turning
 * replay protection off for tests — would mean never testing it.
 */
async function waitForNextStep(page: Page) {
  await page.waitForTimeout(STEP_MS - (Date.now() % STEP_MS) + 1_000);
}

/** Email + password. Stops before the second factor. */
async function submitCredentials(
  page: Page,
  email = ADMIN.email,
  password = ADMIN.password,
) {
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** The full two-step sign-in, retrying once across a step boundary. */
async function signIn(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await submitCredentials(page, email, password);

  const code = page.getByLabel("Authentication code");

  // Wrong credentials never reach step two; let the caller assert on that.
  if (!(await code.isVisible().catch(() => false))) return;

  await code.fill(await currentCode());
  await page.getByRole("button", { name: "Verify code" }).click();

  const rejected = page.getByRole("alert");

  if (await rejected.isVisible().catch(() => false)) {
    await waitForNextStep(page);
    await code.fill(await currentCode());
    await page.getByRole("button", { name: "Verify code" }).click();
  }
}

test.describe("Guarding the back office", () => {
  test("redirects an anonymous visitor to the login form", async ({ page }) => {
    await page.goto(DASHBOARD);

    await expect(page).toHaveURL(/\/en\/login/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  });

  test("remembers where the visitor was headed", async ({ page }) => {
    await page.goto("/en/admin/leads?status=NEW");

    // The callbackUrl is what makes a bookmarked deep link survive a
    // session expiry: sign in, land where you meant to.
    await expect(page).toHaveURL(/callbackUrl=/);
    expect(decodeURIComponent(page.url())).toContain("/en/admin/leads?status=NEW");
  });

  test.describe("every admin section", () => {
    // Enumerated rather than spot-checked. The guard is a regex over the
    // path; one section added outside the pattern is exactly the mistake
    // this catches, and it is invisible from the section's own code.
    for (const section of [
      "",
      "/leads",
      "/projects",
      "/news",
      "/events",
      "/users",
      "/faqs",
      "/settings",
    ]) {
      test(`/admin${section || " (dashboard)"} is closed to anonymous requests`, async ({
        page,
      }) => {
        await page.goto(`/en/admin${section}`);
        await expect(page).toHaveURL(/\/en\/login/);
      });
    }
  });
});

test.describe("Signing in", () => {
  test("rejects a wrong password without saying which field was wrong", async ({ page }) => {
    await page.goto(LOGIN);

    await signIn(page, ADMIN.email, "definitely-not-the-password");

    const error = page.getByRole("alert");
    await expect(error).toBeVisible();
    await expect(error).toContainText("not recognised");

    // Still on the login page, no session issued.
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("gives an unknown address the identical message", async ({ page }) => {
    await page.goto(LOGIN);

    await signIn(page, "nobody@andaman.test", "definitely-not-the-password");

    // Byte-for-byte identical to the wrong-password case. Distinguishing
    // them would turn the login form into an oracle for which addresses
    // belong to staff — the first step of a targeted attempt.
    await expect(page.getByRole("alert")).toContainText("not recognised");
  });

  test("signs in and lands on the dashboard", async ({ page }) => {
    await page.goto(LOGIN);

    await signIn(page);

    await expect(page).toHaveURL(/\/en\/admin/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("returns to the page that triggered the redirect", async ({ page }) => {
    await page.goto("/en/admin/leads");
    await expect(page).toHaveURL(/callbackUrl/);

    await signIn(page);

    await expect(page).toHaveURL(/\/en\/admin\/leads/);
  });

  test("sends an already-authenticated visitor onward from the login form", async ({
    page,
  }) => {
    await page.goto(LOGIN);
    await signIn(page);
    await expect(page).toHaveURL(/\/en\/admin/);

    // Going back to /login with a live session should not show a form
    // again — it is a dead end that invites a pointless second sign-in.
    await page.goto(LOGIN);
    await expect(page).toHaveURL(/\/en\/admin/);
  });

  test("issues an httpOnly session cookie", async ({ page, context }) => {
    await page.goto(LOGIN);
    await signIn(page);
    await expect(page).toHaveURL(/\/en\/admin/);

    const cookies = await context.cookies();
    const session = cookies.find((cookie) =>
      cookie.name.includes("next-auth.session-token"),
    );

    expect(session, "no session cookie was set").toBeDefined();
    // httpOnly is what keeps an XSS from lifting the session wholesale.
    expect(session!.httpOnly).toBe(true);
    expect(session!.sameSite).toBe("Lax");
  });

  test("keeps the session across a reload", async ({ page }) => {
    await page.goto(LOGIN);
    await signIn(page);
    await expect(page).toHaveURL(/\/en\/admin/);

    await page.reload();

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});

test.describe("Signing out", () => {
  test("ends the session and re-closes the back office", async ({ page }) => {
    await page.goto(LOGIN);
    await signIn(page);
    await expect(page).toHaveURL(/\/en\/admin/);

    await page.getByRole("button", { name: "Sign out" }).first().click();

    // Cookie cleared, so the guard applies again on the next request.
    await page.goto(DASHBOARD);
    await expect(page).toHaveURL(/\/en\/login/);
  });
});

test.describe("Accessibility", () => {
  test("the login form has no automatically detectable violations", async ({ page }) => {
    await page.goto(LOGIN);
    await expectNoA11yViolations(page);
  });

  test("the error state has none either", async ({ page }) => {
    await page.goto(LOGIN);
    await signIn(page, ADMIN.email, "wrong");

    await expect(page.getByRole("alert")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("the dashboard has none", async ({ page }) => {
    // The back office is used all day by people who did not choose it —
    // it earns the same floor as the marketing site, not a lower one.
    await page.goto(LOGIN);
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await expectNoA11yViolations(page);
  });

  test("the form is operable by keyboard alone", async ({ page }) => {
    await page.goto(LOGIN);

    await page.getByLabel("Email address").focus();
    await page.keyboard.type(ADMIN.email);
    await page.keyboard.press("Tab");
    await page.keyboard.type(ADMIN.password);
    await page.keyboard.press("Enter");

    // Enter submits from within a field — a form that only responds to a
    // click on the button is broken for anyone not using a mouse. The
    // second factor has to be reachable the same way, and focus must land
    // on the code field without a Tab of its own.
    const code = page.getByLabel("Authentication code");
    await expect(code).toBeFocused();

    await page.keyboard.type(await currentCode());
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/en\/admin/);
  });
});

test.describe("The second factor", () => {
  test("asks for a code once the password is accepted", async ({ page }) => {
    await page.goto(LOGIN);
    await submitCredentials(page);

    // Still on the login page, now with a code field — and no session yet.
    await expect(page.getByLabel("Authentication code")).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login/);

    const cookies = await page.context().cookies();
    expect(
      cookies.some((cookie) => cookie.name.includes("next-auth.session-token")),
    ).toBe(false);
  });

  test("never asks for a code when the password is wrong", async ({ page }) => {
    // Otherwise the code step itself becomes a password oracle: type any
    // address, see whether a code is requested, learn which are real.
    await page.goto(LOGIN);
    await submitCredentials(page, ADMIN.email, "not-the-password");

    await expect(page.getByRole("alert")).toContainText("not recognised");
    await expect(page.getByLabel("Authentication code")).toBeHidden();
  });

  test("refuses a wrong code", async ({ page }) => {
    await page.goto(LOGIN);
    await submitCredentials(page);

    await page.getByLabel("Authentication code").fill("000000");
    await page.getByRole("button", { name: "Verify code" }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("signs in with a correct code", async ({ page }) => {
    await page.goto(LOGIN);
    await signIn(page);

    await expect(page).toHaveURL(/\/en\/admin/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});
