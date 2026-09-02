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

import { expect, test } from "./harness";
import { expectNoA11yViolations } from "./a11y";
import { ADMIN, PENDING_ADMIN } from "./fixtures";
import {
  DASHBOARD,
  LOGIN,
  alertBanner,
  currentCode,
  signIn,
  submitCredentials,
  waitForNextStep,
} from "./sign-in";

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

    const error = alertBanner(page);
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
    await expect(alertBanner(page)).toContainText("not recognised");
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

    /*
      signOut({ callbackUrl }) in AdminSidebar.tsx does a real full-page
      navigation to that URL, not a client-side one — NextAuth posts to
      /api/auth/signout and then sends the browser there itself. The click
      above only waits for the event to dispatch, not for that navigation
      to land, so a goto(DASHBOARD) issued immediately after raced it: two
      navigations in flight on the same page, and Chromium aborts
      whichever one loses with net::ERR_ABORTED — not a real bug, just
      this test not waiting for the thing it just triggered.
    */
    await page.waitForURL(/\/en\/login/);

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

    await expect(alertBanner(page)).toBeVisible();
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

    const error = alertBanner(page);

    await page.keyboard.type(await currentCode());
    await page.keyboard.press("Enter");

    /*
      This test types its own code rather than going through signIn(), so
      it also needs signIn()'s guard against the same hazard: this run's
      code can land in the same 30-second step as a sign-in earlier in the
      suite and be refused as a replay rather than a wrong code. LoginForm
      doesn't refocus the field on TOTP_INVALID (only on the first
      TOTP_REQUIRED reveal), so focus is still sitting on the code input
      and a plain keyboard.type reaches it.
    */
    await Promise.race([
      page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 5_000 }).catch(() => {}),
      error.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {}),
    ]);

    if (await error.isVisible().catch(() => false)) {
      await waitForNextStep(page);
      await page.keyboard.type(await currentCode());
      await page.keyboard.press("Enter");
    }

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

    await expect(alertBanner(page)).toContainText("not recognised");
    await expect(page.getByLabel("Authentication code")).toBeHidden();
  });

  test("refuses a wrong code", async ({ page }) => {
    await page.goto(LOGIN);
    await submitCredentials(page);

    await page.getByLabel("Authentication code").fill("000000");
    await page.getByRole("button", { name: "Verify code" }).click();

    await expect(alertBanner(page)).toBeVisible();
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test("signs in with a correct code", async ({ page }) => {
    await page.goto(LOGIN);
    await signIn(page);

    await expect(page).toHaveURL(/\/en\/admin/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});

/*
  The enrolment gate on a path middleware cannot see.

  Signing a URL is granting write access to the bucket, so /api/uploads/presign
  is a mutation and belongs behind the same guard as every server action. It
  used to check only that a session existed, which is a weaker question: an
  ADMIN who has authenticated but not yet enrolled a second factor also has
  one. That account is redirected away from every admin page, so the hole
  was invisible through the UI and reachable with one POST.

  The assertion is on the endpoint rather than the uploader component
  because the component is the part that was never the problem.
*/
test.describe("Signed upload URLs", () => {
  const PRESIGN = "/api/uploads/presign";
  const BODY = {
    filename: "floor-plan.jpg",
    contentType: "image/jpeg",
    size: 1024,
    prefix: "projects",
  };

  test("refuses an anonymous caller", async ({ request }) => {
    // Otherwise the CDN is free storage for anyone who finds the route.
    const response = await request.post(PRESIGN, { data: BODY });

    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe("UNAUTHORISED");
  });

  test("refuses an admin who still owes a second factor", async ({ page }) => {
    await page.goto(LOGIN);
    await page.getByLabel("Email address").fill(PENDING_ADMIN.email);
    await page.getByLabel("Password").fill(PENDING_ADMIN.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // The account authenticates and is held at enrolment — no code prompt,
    // because it has no authenticator to prompt for yet.
    await expect(page).toHaveURL(/\/admin\/account\/security/);

    // page.request carries the session cookie, so this is the same caller
    // the browser is, not an anonymous one.
    const response = await page.request.post(PRESIGN, { data: BODY });

    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe("TWO_FACTOR_SETUP_REQUIRED");
  });
});
