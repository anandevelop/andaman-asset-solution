/**
 * e2e/sign-in.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Getting a real session, for the specs that need one.
 *
 * Lifted out of admin-login.spec.ts when a second spec needed to sign in.
 * Every subtlety below was paid for by a debugging session — the account
 * pool, the announcer exclusion, the race after the credentials click —
 * and a copy in the second spec would have drifted from this one the first
 * time either was fixed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { type Page } from "@playwright/test";
import { generate } from "otplib";
import { ADMIN, ADMIN_POOL } from "./fixtures";

export const LOGIN = "/en/login";
export const DASHBOARD = "/en/admin";

/** Length of one TOTP step, and therefore of one code. */
export const STEP_MS = 30_000;

/** Fresh code from the fixture secret — the same one the seed enrolled. */
export function currentCode(): Promise<string> {
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
export async function waitForNextStep(page: Page) {
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

export function nextAccount() {
  return ADMIN_POOL[poolCursor++ % ADMIN_POOL.length];
}

/** Email + password. Stops before the second factor. */
export async function submitCredentials(
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
export function alertBanner(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)').filter({ hasText: /\S/ });
}

/** The full two-step sign-in, retrying once across a step boundary. */
export async function signIn(
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

