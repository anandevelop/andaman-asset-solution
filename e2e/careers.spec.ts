/**
 * e2e/careers.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "Join our team", end to end: a visitor applies from the About page, and
 * the application is then read by the two roles allowed to — and by
 * nobody else, by the menu, by the pages and by going straight at the
 * addresses.
 *
 * Storage is not configured in this suite, so attachments are covered by
 * the path an applicant meets when uploads are down: told so, and still
 * able to apply. The upload tokens themselves are unit-tested
 * (tests/careers/upload-token.test.ts).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "../lib/prisma-adapter";
import { expect, test } from "./harness";
import { expectNoA11yViolations } from "./a11y";
import { BOT, HR, JOB_POSITIONS } from "./fixtures";
import { signIn, LOGIN } from "./sign-in";
import { uniqueThaiMobile } from "./phones";

test.setTimeout(180_000);
// One story told in order: apply, then read, then manage.
test.describe.configure({ mode: "serial" });

let client: PrismaClient | null = null;
const db = () => (client ??= new PrismaClient({ adapter: pgAdapter(process.env.E2E_DATABASE_URL) }));
test.afterAll(async () => {
  await client?.$disconnect();
});

const APPLICANT = { firstName: "Narin", lastName: "Careerstest", email: "narin.careers@example.com" };

async function passwordSignIn(page: import("@playwright/test").Page, account: { email: string; password: string }) {
  await page.goto(LOGIN);
  await page.getByLabel("Email address").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/en\/admin(?!\/account\/security)/, { timeout: 20_000 });
}

test("a visitor applies from the About page, consent first", async ({ page }) => {
  await page.goto("/en/about");

  const section = page.locator("#careers");
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("heading", { level: 2 })).toBeVisible();
  // The closed vacancy is not advertised.
  await expect(section.getByText(JOB_POSITIONS.closed.en)).toHaveCount(0);
  // The footer points here from every page.
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Careers" })).toHaveAttribute("href", "/en/about#careers");

  await section.getByRole("button", { name: `Apply for ${JOB_POSITIONS.open.en}` }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Apply to join us" })).toBeVisible();

  // Step one is the notice. Nothing can be typed until it is agreed to.
  await expect(dialog.getByLabel("First name")).toHaveCount(0);
  const next = dialog.getByRole("button", { name: "Consent and continue" });
  await expect(next).toBeDisabled();
  await expectNoA11yViolations(page, { include: "dialog" });
  await dialog.getByRole("checkbox").check();
  await next.click();

  // Sending it empty names each field rather than failing quietly.
  await dialog.getByRole("button", { name: "Send application" }).click();
  // Six of them: every field but the position, which is already chosen.
  await expect(dialog.getByText("Please fill this in")).toHaveCount(6);

  await dialog.getByLabel("First name").fill(APPLICANT.firstName);
  await dialog.getByLabel("Last name").fill(APPLICANT.lastName);
  await dialog.getByLabel("Email").fill(APPLICANT.email);
  await dialog.getByLabel("Phone number").fill(uniqueThaiMobile().typed);
  await dialog.getByLabel("Highest education").selectOption("bachelor");
  await dialog.getByLabel(/Expected salary/).fill("35,000");
  await expect(dialog.getByLabel(/Expected salary/)).toHaveValue("35000");

  // No storage here: the form says so and the application still goes.
  await dialog.locator('input[type="file"]').setInputFiles({
    name: "resume.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% e2e\n"),
  });
  await expect(dialog.getByText(/Attachments are unavailable at the moment/)).toBeVisible();
  await expectNoA11yViolations(page, { include: "dialog" });

  await dialog.getByRole("button", { name: "Send application" }).click();
  await expect(dialog.getByRole("heading", { name: "We have your application" })).toBeVisible({ timeout: 20_000 });

  const stored = await db().jobApplication.findFirst({ where: { email: APPLICANT.email }, include: { files: true } });
  expect(stored).toMatchObject({
    firstName: APPLICANT.firstName,
    // Stored in Thai whatever language the applicant used: HR reads it.
    positionTitle: JOB_POSITIONS.open.th,
    education: "bachelor",
    expectedSalary: 35000,
    status: "NEW",
    locale: "en",
    consentVersion: "applicant-notice-v1",
    viewedAt: null,
  });
  expect(stored!.files).toEqual([]);
  // Kept for the period the notice promised: twelve months by default.
  const months = (stored!.purgeAfter.getTime() - stored!.createdAt.getTime()) / (30.44 * 86_400_000);
  expect(Math.round(months)).toBe(12);
});

test("HR reads the application and reaches nothing else", async ({ page }) => {
  await passwordSignIn(page, HR);

  // The menu: the dashboard and careers.
  const careers = page.getByRole("link", { name: /^Careers/ }).first();
  await expect(careers).toBeVisible();
  for (const name of ["Leads & appointments", "News", "Projects & units", "Settings", "Users & permissions"]) {
    await expect(page.getByRole("link", { name: new RegExp(`^${name}`) }), name).toHaveCount(0);
  }
  await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  // Their own front page, not the sales dashboard and its lead counts.
  await expect(page.getByRole("heading", { name: `Hello, ${HR.name}` })).toBeVisible();
  await expect(page.getByText("Applications not opened yet")).toBeVisible();
  await expect(page.locator("[data-admin-page]").getByText(/leads/i)).toHaveCount(0);

  for (const path of ["/en/admin/leads", "/en/admin/news", "/en/admin/projects", "/en/admin/users", "/en/admin/settings/system", "/en/admin/activity"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/en\/admin\?denied=1/);
  }
  expect((await page.request.get("/api/admin/leads/export")).status()).toBe(403);

  await page.goto("/en/admin/careers");
  await expect(page.getByRole("heading", { name: "Job applications" })).toBeVisible();
  await page.getByRole("link", { name: `Open the application from ${APPLICANT.firstName} ${APPLICANT.lastName}` }).click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("link", { name: APPLICANT.email })).toBeVisible();
  await expect(drawer.getByText("THB 35,000 / month")).toBeVisible();
  await expect(drawer.getByText(/consented on/)).toBeVisible();
  // Opening it is what marks it read.
  await expect.poll(async () => (await db().jobApplication.findFirst({ where: { email: APPLICANT.email } }))?.viewedAt).not.toBeNull();

  await drawer.getByLabel("Status").selectOption("INTERVIEW");
  await drawer.getByRole("button", { name: "Save status" }).click();
  await expect(page.getByRole("dialog").getByText("Interview").first()).toBeVisible();

  await page.getByRole("dialog").getByLabel("Internal notes").fill("Called, interview on Friday");
  await page.getByRole("dialog").getByRole("button", { name: "Add note" }).click();
  await expect(page.getByRole("dialog").getByText("Called, interview on Friday")).toBeVisible();
  await expect(page.getByRole("dialog").getByText(new RegExp(HR.name))).toBeVisible();

  // The PDF is a print view of the one application.
  await page.getByRole("dialog").getByRole("link", { name: "Print / save as PDF" }).click();
  await expect(page.getByRole("heading", { name: "Job application", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: `${APPLICANT.firstName} ${APPLICANT.lastName}` })).toBeVisible();
  await expect(page.getByText("Called, interview on Friday")).toBeVisible();

  // An attachment that does not exist is a 404, not a way to probe storage.
  expect((await page.request.get("/api/admin/careers/files/nope")).status()).toBe(404);
});

test("HR adds, closes and removes a vacancy, and the site follows", async ({ page }) => {
  await passwordSignIn(page, HR);
  await page.goto("/en/admin/careers/positions");

  await page.getByRole("link", { name: "Add position" }).click();
  const drawer = page.getByRole("dialog");
  // No title in any language is refused.
  await drawer.getByRole("button", { name: "Save position" }).click();
  await expect(page.getByRole("dialog").getByText("A title is needed in at least one language")).toBeVisible();

  await page.getByRole("dialog").locator("#title-en").fill("Interior Designer");
  await page.getByRole("dialog").locator("#location-en").fill("Phuket");
  await page.getByRole("dialog").getByRole("button", { name: "Save position" }).click();
  await expect(page.getByText("Interior Designer")).toBeVisible();

  await page.goto("/en/about");
  await expect(page.locator("#careers").getByRole("button", { name: "Apply for Interior Designer" })).toBeVisible();

  // Closed: off the site, still in the list.
  await page.goto("/en/admin/careers/positions");
  const row = page.getByRole("listitem").filter({ hasText: "Interior Designer" });
  await row.getByRole("button", { name: "Close applications" }).click();
  await expect(row.getByText("Closed")).toBeVisible();
  await page.goto("/en/about");
  await expect(page.locator("#careers").getByText("Interior Designer")).toHaveCount(0);

  // Deleted.
  await page.goto("/en/admin/careers/positions");
  await page.getByRole("listitem").filter({ hasText: "Interior Designer" }).getByRole("link", { name: "Edit" }).click();
  page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("dialog").getByRole("button", { name: "Delete position" }).click();
  await expect(page.getByText("Interior Designer")).toHaveCount(0);

  // The invitation's wording and the retention period are HR's to set.
  await page.locator("#inviteTitle-en").fill("Come and build with us");
  await page.getByLabel("How long applications are kept").selectOption("6");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  await page.goto("/en/about");
  await expect(page.locator("#careers").getByRole("heading", { name: "Come and build with us" })).toBeVisible();
  await page.locator("#careers").getByRole("button", { name: `Apply for ${JOB_POSITIONS.open.en}` }).click();
  await expect(page.getByRole("dialog").getByText(/6 months/)).toBeVisible();
});

test("applications are closed to every other role, the bot and ADMIN included", async ({ page, browser }) => {
  await passwordSignIn(page, BOT);
  await expect(page.getByRole("link", { name: /^Careers/ })).toHaveCount(0);
  for (const path of ["/en/admin/careers", "/en/admin/careers/positions", "/en/admin/careers/anything/print"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/en\/admin\?denied=1/);
  }
  expect((await page.request.get("/api/admin/careers/files/nope")).status()).toBe(403);

  // Signed out: the file route answers nothing, and the pages go to sign-in.
  const anonymous = await browser.newContext();
  expect((await anonymous.request.get("/api/admin/careers/files/nope")).status()).toBe(403);
  const visitor = await anonymous.newPage();
  await visitor.goto("/en/admin/careers");
  await expect(visitor).toHaveURL(/\/en\/login/);
  await anonymous.close();
});

test("the owner sees them, and erasing one removes it", async ({ page }) => {
  await page.goto(LOGIN);
  await signIn(page);
  await page.goto("/en/admin/careers");
  await page.getByRole("link", { name: `Open the application from ${APPLICANT.firstName} ${APPLICANT.lastName}` }).click();

  page.once("dialog", (confirm) => confirm.accept());
  await page.getByRole("dialog").getByRole("button", { name: "Erase this application" }).click();
  await expect(page.getByText("No applications yet")).toBeVisible();

  expect(await db().jobApplication.count({ where: { email: APPLICANT.email } })).toBe(0);
  // The trail says an application was erased, and not whose.
  const entry = await db().auditLog.findFirst({ where: { action: "erase_application" }, orderBy: { createdAt: "desc" } });
  expect(entry).toMatchObject({ model: "JobApplication", recordLabel: null });
});
