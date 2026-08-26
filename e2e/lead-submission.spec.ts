/**
 * e2e/lead-submission.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * A buyer enquires about a project.
 *
 * This is the only journey on the site that produces revenue, and it is
 * the one the unit tests can say least about: LeadForm.test.tsx asserts
 * that the right JSON is posted, but a stubbed fetch cannot tell you the
 * route parsed it, the schema accepted it, the PDPA consent trail was
 * written, or that the row is actually in Postgres afterwards.
 *
 * So the assertions here end at the database. A green "thank you" message
 * over a lead that was never written is the exact failure worth catching —
 * it is invisible on the site and only surfaces as a quiet week for the
 * sales team.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { expectNoA11yViolations } from "./a11y";
import { LEAD_PROJECT } from "./fixtures";

const PROJECT_URL = `/en/projects/${LEAD_PROJECT.slug}`;

/*
  Constructed lazily.

  Prisma's constructor validates the URL eagerly, so building the client at
  module scope makes `playwright test --list` — and any tooling that merely
  imports the spec — throw when E2E_DATABASE_URL is absent. Collection
  should not need a database.
*/
let client: PrismaClient | null = null;

function db(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      datasources: { db: { url: process.env.E2E_DATABASE_URL } },
    });
  }
  return client;
}

test.afterAll(async () => {
  await client?.$disconnect();
});

/** A distinct address per test, so one test never reads another's row. */
function uniqueEmail(label: string) {
  return `e2e-${label}-${Date.now()}@example.test`;
}

async function fillEnquiry(
  page: import("@playwright/test").Page,
  overrides: Partial<{ name: string; email: string; phone: string; message: string }> = {},
) {
  const values = {
    name: "Somchai Prasert",
    email: uniqueEmail("lead"),
    phone: "0812345678",
    message: "Please send the floor plans for the four-bedroom type.",
    ...overrides,
  };

  await page.getByLabel("Full name").fill(values.name);
  await page.getByLabel("Phone number").fill(values.phone);
  await page.getByLabel("Email address").fill(values.email);
  await page.getByLabel("Message (optional)").fill(values.message);
  await page.getByRole("checkbox").check();

  return values;
}

test.describe("Lead submission", () => {
  test("writes the enquiry to the database and confirms it", async ({ page }) => {
    await page.goto(PROJECT_URL);

    const values = await fillEnquiry(page);
    await page.getByRole("button", { name: "Request viewing" }).click();

    await expect(page.getByText(/we've received your request/i)).toBeVisible();

    const lead = await db().leadInquiry.findFirst({
      where: { email: values.email },
      include: { project: true },
    });

    expect(lead).not.toBeNull();
    expect(lead!.name).toBe(values.name);
    expect(lead!.phone).toBe(values.phone);
    expect(lead!.message).toBe(values.message);

    // Attribution: the enquiry has to arrive attached to the project whose
    // page it was sent from, or the sales team is calling back blind.
    expect(lead!.project?.slug).toBe(LEAD_PROJECT.slug);
    expect(lead!.source).toBe("PROJECT_PAGE");

    // Every new lead starts as NEW; the admin board depends on it.
    expect(lead!.status).toBe("NEW");
  });

  test("records the PDPA consent trail", async ({ page }) => {
    // Thailand's PDPA requires a demonstrable record of consent, which
    // means the flag, the timestamp and the policy version the visitor
    // actually agreed to — a boolean alone proves nothing a year later.
    await page.goto(PROJECT_URL);

    const values = await fillEnquiry(page);
    await page.getByRole("button", { name: "Request viewing" }).click();
    await expect(page.getByText(/we've received your request/i)).toBeVisible();

    const lead = await db().leadInquiry.findFirstOrThrow({
      where: { email: values.email },
    });

    expect(lead.consentGiven).toBe(true);
    expect(lead.consentedAt).toBeInstanceOf(Date);
    expect(lead.consentVersion).toMatch(/^privacy-policy-v/);
  });

  test("clears the form after sending", async ({ page }) => {
    await page.goto(PROJECT_URL);

    await fillEnquiry(page);
    await page.getByRole("button", { name: "Request viewing" }).click();
    await expect(page.getByText(/we've received your request/i)).toBeVisible();

    // A form still full of the visitor's details under a "thank you"
    // message reads as though nothing was sent, and the obvious response —
    // pressing submit again — files a duplicate the team then calls twice.
    await expect(page.getByLabel("Full name")).toHaveValue("");
    await expect(page.getByLabel("Email address")).toHaveValue("");
  });

  test("carries UTM attribution from the landing URL", async ({ page }) => {
    await page.goto(`${PROJECT_URL}?utm_source=google&utm_medium=cpc&utm_campaign=villas-q3`);

    const values = await fillEnquiry(page);
    await page.getByRole("button", { name: "Request viewing" }).click();
    await expect(page.getByText(/we've received your request/i)).toBeVisible();

    const lead = await db().leadInquiry.findFirstOrThrow({
      where: { email: values.email },
    });

    // Without this the ad spend cannot be attributed to anything, and the
    // campaign that actually works is indistinguishable from the one that
    // does not.
    expect(lead.utmSource).toBe("google");
    expect(lead.utmMedium).toBe("cpc");
    expect(lead.utmCampaign).toBe("villas-q3");
  });

  test("refuses an incomplete enquiry without touching the database", async ({ page }) => {
    await page.goto(PROJECT_URL);

    const before = await db().leadInquiry.count();

    await page.getByLabel("Full name").fill("A");
    await page.getByRole("button", { name: "Request viewing" }).click();

    await expect(page.getByText("Name is too short")).toBeVisible();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();

    expect(await db().leadInquiry.count()).toBe(before);
  });

  test("will not submit without PDPA consent", async ({ page }) => {
    await page.goto(PROJECT_URL);

    const before = await db().leadInquiry.count();

    await page.getByLabel("Full name").fill("Anna Lindqvist");
    await page.getByLabel("Phone number").fill("0812345678");
    await page.getByLabel("Email address").fill(uniqueEmail("noconsent"));
    // Consent box deliberately left unticked.
    await page.getByRole("button", { name: "Request viewing" }).click();

    await expect(
      page.getByText("Consent is required to submit this form"),
    ).toBeVisible();

    expect(await db().leadInquiry.count()).toBe(before);
  });

  test("silently discards a submission that filled the honeypot", async ({ page }) => {
    await page.goto(PROJECT_URL);

    const before = await db().leadInquiry.count();
    const email = uniqueEmail("bot");

    // Posted directly: the field is hidden, so only a script fills it.
    const response = await page.request.post("/api/leads", {
      data: {
        name: "Acme Marketing",
        email,
        phone: "0800000000",
        consentGiven: true,
        company: "Acme Ltd", // ← the honeypot
        source: "PROJECT_PAGE",
      },
    });

    // The response looks like success on purpose. Telling a bot it was
    // detected only teaches whoever wrote it which field to leave alone.
    expect(response.ok()).toBeTruthy();

    expect(await db().leadInquiry.count()).toBe(before);
    expect(await db().leadInquiry.findFirst({ where: { email } })).toBeNull();
  });

  test("has no automatically detectable accessibility violations", async ({ page }) => {
    await page.goto(PROJECT_URL);
    await expectNoA11yViolations(page);
  });

  test("the error state is accessible too", async ({ page }) => {
    // The state axe most often misses is the one that only appears after
    // an interaction: error text, aria-invalid inputs, a live region with
    // content in it.
    await page.goto(PROJECT_URL);

    await page.getByRole("button", { name: "Request viewing" }).click();
    await expect(page.getByText("Name is too short")).toBeVisible();

    await expectNoA11yViolations(page);
  });

  test("is reachable and submittable by keyboard alone", async ({ page }) => {
    await page.goto(PROJECT_URL);

    const name = page.getByLabel("Full name");
    await name.focus();

    // Tab order must run name → phone → email → nationality → message,
    // matching the visual order. A grid layout that reorders columns for
    // wide screens is the usual way this silently breaks.
    await page.keyboard.type("Keyboard Buyer");
    await page.keyboard.press("Tab");
    await page.keyboard.type("0898765432");
    await page.keyboard.press("Tab");

    const email = uniqueEmail("keyboard");
    await page.keyboard.type(email);

    await expect(page.getByLabel("Phone number")).toHaveValue("0898765432");
    await expect(page.getByLabel("Email address")).toHaveValue(email);
  });
});
