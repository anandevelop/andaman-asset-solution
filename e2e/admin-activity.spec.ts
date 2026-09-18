/**
 * e2e/admin-activity.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * That a change made in the back office actually turns into an entry.
 *
 * This is the check the feature shipped without, and its absence is why a
 * completely inert audit trail passed forty unit and integration tests. The
 * actor is established by the admin guard and read, several awaits later
 * and from a separately bundled copy of the same module, by a Prisma client
 * extension. Nothing below the level of a real request exercises that
 * joint: the other suites set the actor themselves, in one async context
 * and one module instance, which is the one arrangement that always works.
 *
 * The failure mode is silence — no exception, no log line, an empty table
 * that reads as "nobody did this". So the assertion has to be made from the
 * outside, on the page a human would open to answer that question.
 *
 * Nothing here mutates the fixture projects. The FAQ it creates is
 * unpublished, which keeps it off the public pages the other specs count.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { expect, test } from "./harness";
import { alertBanner, nextAccount, signIn, submitCredentials } from "./sign-in";
import { LEAD_PROJECT } from "./fixtures";

const ACTIVITY = "/en/admin/activity";

/** Forces the English editing tab, so the entry's label is predictable. */
const FAQS = "/en/admin/pages/faq?lang=en";

/** Distinct per run, so a row cannot be confused with an earlier one. */
const uniqueQuestion = () => `E2E audit probe ${Date.now()}`;

test.describe("The activity log", () => {
  test("records what an administrator just did, and names them", async ({ page }) => {
    const account = nextAccount();
    const question = uniqueQuestion();

    await page.goto("/en/login");
    await signIn(page, account.email);

    await page.goto(FAQS);
    await page.locator('input[name="question"]').first().fill(question);
    await page
      .locator('textarea[name="answer"]')
      .first()
      .fill("Seeded by the audit trail end-to-end spec.");
    await page.getByRole("button", { name: "Create", exact: true }).first().click();

    /*
      Wait for the FAQ itself to appear in the list below the form, not for
      the "Saved" toast: the toast dismisses itself after four seconds, so
      asserting on it races a slow action and fails for a reason that has
      nothing to do with the trail. The row appearing means the action
      finished and revalidated, which is the state the next page needs.
    */
    await expect(page.locator(`input[name="question"][value="${question}"]`)).toHaveCount(1);

    await page.goto(ACTIVITY);

    await expect(page.getByRole("heading", { name: "Activity log" })).toBeVisible();
    await expect(page.getByText("Nothing has been changed yet.")).toHaveCount(0);

    /*
      One row, asserted as a row rather than as four separate page-level
      text matches: the point is that this administrator, this action and
      this record belong to the same entry. Text matched anywhere on the
      page would pass on a trail that had them scattered across three.
    */
    const entry = page.getByRole("row").filter({ hasText: question });

    await expect(entry).toHaveCount(1);
    await expect(entry).toContainText(account.email);
    await expect(entry).toContainText("created");
    await expect(entry).toContainText("Faq");

    // Field names, not values — the answer text must not be here.
    await expect(entry).toContainText("questionEn");
    await expect(entry).not.toContainText("Seeded by the audit trail");
  });

  test("records signing in and signing out, with the times they happened", async ({
    page,
  }) => {
    const visitor = nextAccount();

    await page.goto("/en/login");
    await signIn(page, visitor.email);
    await expect(page).toHaveURL(/\/en\/admin/);

    await page.getByRole("button", { name: "Sign out" }).first().click();

    // signOut() navigates the whole page rather than routing client-side;
    // see the note in admin-login.spec.ts. Waiting for it here keeps the
    // sign-in below from racing a navigation already in flight.
    await page.waitForURL(/\/en\/login/);

    /*
      A second account reads the log, not the first one signing back in.
      Re-using the account would put a third entry under the same address
      and make "did the sign-out get recorded" a question about counting
      rather than about the trail.
    */
    await signIn(page, nextAccount().email);
    await page.goto(ACTIVITY);

    const theirs = page.getByRole("row").filter({ hasText: visitor.email });

    await expect(theirs.filter({ hasText: "signed in" })).toHaveCount(1);
    await expect(theirs.filter({ hasText: "signed out" })).toHaveCount(1);

    /*
      The point of the feature: a date and a time against each. The column
      is a <time> element, so this asserts the cell was actually formatted
      from a timestamp rather than left blank.
    */
    await expect(theirs.filter({ hasText: "signed in" }).locator("time")).toHaveCount(1);

    // An auth entry is about a person; it must not claim to be about a row.
    await expect(theirs.filter({ hasText: "signed in" })).not.toContainText("Session");
  });

  test("records a failed sign-in without dressing it up as the person", async ({
    page,
  }) => {
    const target = nextAccount();

    /*
      A proxy's header, because nothing else supplies one.

      clientIp() reads x-forwarded-for, x-real-ip or cf-connecting-ip — in
      production those are set by nginx or Cloudflare. A local `next dev`
      sits behind nothing, so the address is genuinely unknown there and
      the column is genuinely null. Setting the header is what a proxy
      does, and it is the only way to prove the column is written and
      rendered rather than merely declared.
    */
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "203.0.113.9" });

    await page.goto("/en/login");
    await submitCredentials(page, target.email, "definitely-not-the-password");
    await expect(alertBanner(page)).toBeVisible();

    // A different account reads the log; the attempt above never got in.
    await signIn(page, nextAccount().email);
    await page.goto(ACTIVITY);

    const attempt = page
      .getByRole("row")
      .filter({ hasText: target.email })
      .filter({ hasText: "failed sign-in" });

    await expect(attempt).toHaveCount(1);
    await expect(attempt).toContainText("203.0.113.9");

    /*
      The line that keeps the row honest. On every other entry the address
      is an identity the application confirmed; here it is a string
      somebody typed, and without this the row reads as "this
      administrator did something" when it may have been a stranger who
      knew their address.
    */
    await expect(attempt).toContainText("address not verified");
  });

  test("leaves a visitor's enquiry out of it", async ({ page }) => {
    /*
      The trail answers "which administrator changed this", so a write with
      nobody signed in behind it must not appear — and must not appear
      under the name of whoever happens to read the page next.

      Submitted first, anonymously, then read back through an admin
      session, because that is the order it happens in real life.
    */
    await page.goto(`/en/projects/${LEAD_PROJECT.slug}`);

    const email = `audit-probe-${Date.now()}@example.com`;
    await page.getByLabel("Full name").fill("Audit Probe Visitor");
    await page.getByLabel("Phone number").fill("0812345678");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Message (optional)").fill("Sent with no session at all.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Request viewing" }).click();

    await expect(page.getByRole("dialog").getByText("Thank you")).toBeVisible();

    await page.goto("/en/login");
    await signIn(page, nextAccount().email);
    await page.goto(ACTIVITY);

    // Neither the enquiry's own row nor, more importantly, the customer's
    // address anywhere on the page.
    await expect(page.getByRole("row").filter({ hasText: "LeadInquiry" })).toHaveCount(0);
    await expect(page.getByText(email)).toHaveCount(0);
  });
});
