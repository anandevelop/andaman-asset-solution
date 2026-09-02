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

import { type Page } from "@playwright/test";
import { expect, test } from "./harness";
import { generate } from "otplib";
import { expectNoA11yViolations } from "./a11y";
import { ADMIN, ADMIN_POOL, PENDING_ADMIN } from "./fixtures";

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
 * step), so two sign-ins by the *same account* inside the same 30 seconds
 * cannot reuse one. Waiting for the next window is the honest fix where the
 * account has to be the same; the alternative — turning replay protection
 * off for tests — would mean never testing it.
 *
 * Only two places need it now. Everything else takes its own account from
 * the pool instead, because the burned step is per account and waiting out
 * a clock proves nothing: eleven sign-ins were paying 25 to 31 seconds each
 * for the privilege, five of the suite's five and a half minutes.
 */
async function waitForNextStep(page: Page) {
  await page.waitForTimeout(STEP_MS - (Date.now() % STEP_MS) + 1_000);
}

/*
  Hands out a fresh account per full sign-in.

  A plain counter rather than anything random, so a run that fails fails the
  same way twice. It wraps rather than running out: CI retries a failed test
  once, and a suite that threw "out of accounts" because three tests happened
  to retry would be failing for a reason with nothing to do with what it is
  testing.

  Wrapping is safe rather than merely tolerable. Reuse only becomes a wait if
  the same account signs in twice inside one 30-second step, and getting back
  round to an account takes twelve sign-ins — by which time its step has long
  since rolled over.
*/
let poolCursor = 0;

function nextAccount() {
  return ADMIN_POOL[poolCursor++ % ADMIN_POOL.length];
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

/*
  The form's own error banner.

  Not a bare getByRole("alert"): Next renders <div role="alert"
  id="__next-route-announcer__"> on every page, so the bare locator matched
  two elements and every assertion against it died of a strict-mode
  violation instead of reading the message. Inside signIn() below that
  violation was then swallowed by .catch(() => false) and read as "the code
  was accepted" — which is why a rejected first code never triggered the
  retry across the step boundary, and why eight sign-in tests ended up
  asserting against a page still sitting on /en/login.

  Excluded by id, not by "the announcer is always empty" — it isn't. It is
  empty on the page's first paint, but Next writes the new route's title
  into it on every client-side navigation as the screen-reader announcement
  of where the app just went — which includes a *successful* sign-in's own
  router.replace(callbackUrl). A hasText(/\S/) filter alone treated that
  arrival announcement as a rejection: the code had actually been accepted,
  the app had already moved to /en/admin, and signIn() nonetheless walked
  into its retry branch, filled a second code into a form that no longer
  existed, and hung until the whole test's 60s budget ran out waiting for
  it. Only a real validation banner lives inside the login form itself, and
  only it has non-empty text on the *first* render this locator ever needs
  to catch a genuine rejection with — the id exclusion is what keeps a
  correct arrival from being mistaken for one.
*/
function alertBanner(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: /\S/ });
}

/** The full two-step sign-in, retrying once across a step boundary. */
async function signIn(
  page: Page,
  email = nextAccount().email,
  password = ADMIN.password,
) {
  await submitCredentials(page, email, password);

  const code = page.getByLabel("Authentication code");
  const error = alertBanner(page);

  /*
    submitCredentials() only waits for the click to dispatch, not for the
    signIn() call it triggers to resolve — that request is a real round
    trip (a bcrypt compare alone costs real time at cost 12), and the DOM
    does not reflect its outcome until React re-renders afterwards.

    A bare `code.isVisible()` here samples the DOM the instant the click
    handler returns, which is almost always before that re-render — so it
    read "not visible" regardless of whether the credentials were right,
    the 2FA prompt never appeared, nobody typed a code, and every sign-in
    timed out waiting on a page that was simply still waiting for its
    first response. Waiting for whichever of the two possible outcomes
    appears first is what the synchronous check was missing.
  */
  await Promise.race([
    code.waitFor({ state: "visible" }).catch(() => {}),
    error.waitFor({ state: "visible" }).catch(() => {}),
  ]);

  // Wrong credentials never reach step two; let the caller assert on that.
  if (!(await code.isVisible().catch(() => false))) return;

  await code.fill(await currentCode());
  await page.getByRole("button", { name: "Verify code" }).click();

  // Same race, for the outcome of the code submission: either the app
  // navigates away from /login, or the rejection banner appears.
  await Promise.race([
    page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 5_000 }).catch(() => {}),
    error.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {}),
  ]);

  if (await error.isVisible().catch(() => false)) {
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
