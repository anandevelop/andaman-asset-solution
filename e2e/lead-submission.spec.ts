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
import { pgAdapter } from "../lib/prisma-adapter";
import { expect, test } from "./harness";
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
    client = new PrismaClient({ adapter: pgAdapter(process.env.E2E_DATABASE_URL) });
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

/**
 * Opens the phone-country combobox, filters to `countryName`, and picks
 * the (only) match. CountrySelect.tsx renders role="combobox" on the
 * closed trigger button — not the textbook ARIA pattern, where the role
 * sits on the search input, but the one that component's own header
 * documents choosing deliberately — so this is a real open/search/pick
 * sequence, not a single .selectOption() the way a native <select> would
 * allow.
 */
async function pickPhoneCountry(page: import("@playwright/test").Page, countryName: string) {
  await page.getByRole("combobox", { name: "Country code" }).click();
  await page.getByPlaceholder(/search country or code/i).fill(countryName);
  await page.getByRole("option", { name: new RegExp(countryName, "i") }).click();
}

async function fillEnquiry(
  page: import("@playwright/test").Page,
  overrides: Partial<{ name: string; email: string; phone: string; message: string }> = {},
) {
  const values = {
    name: "Somchai Prasert",
    email: uniqueEmail("lead"),
    // The national number as a visitor types it; toE164() (via the
    // TH-default CountrySelect below) turns this into "+66812345678" —
    // see the "writes the enquiry" test for the assertion on that shape.
    phone: "0812345678",
    message: "Please send the floor plans for the four-bedroom type.",
    ...overrides,
  };

  await page.getByLabel("Full name").fill(values.name);
  // Explicit rather than relying on the TH default silently being correct
  // — this is the one piece of the form a stubbed unit test cannot cover
  // at all: CountrySelect.tsx's real open/search/pick sequence in a real
  // browser, with real SVG flags and real focus.
  await pickPhoneCountry(page, "Thailand");
  await page.getByLabel("Phone number").fill(values.phone);
  await page.getByLabel("Email address").fill(values.email);
  await page.getByLabel("Message (optional)").fill(values.message);
  await page.getByRole("checkbox").check();

  // The E.164 value this assembles to, not what was typed — every caller
  // that asserts against the database needs the stored shape.
  return { ...values, phone: "+66812345678" };
}

test.describe("Lead submission", () => {
  test("writes the enquiry to the database and confirms it", async ({ page }) => {
    await page.goto(PROJECT_URL);

    const values = await fillEnquiry(page);
    await page.getByRole("button", { name: "Request viewing" }).click();

    await expect(page.getByRole("dialog").getByText("Thank you")).toBeVisible();

    const lead = await db().leadInquiry.findFirst({
      where: { email: values.email },
      include: { project: true },
    });

    expect(lead).not.toBeNull();
    expect(lead!.name).toBe(values.name);
    expect(lead!.phone).toBe(values.phone);
    // Stored alongside `phone`, not re-derived from it later — see
    // LeadInquiry.phoneCountry's comment in schema.prisma for why.
    expect(lead!.phoneCountry).toBe("TH");
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
    await expect(page.getByRole("dialog").getByText("Thank you")).toBeVisible();

    const lead = await db().leadInquiry.findFirstOrThrow({
      where: { email: values.email },
    });

    expect(lead.consentGiven).toBe(true);
    expect(lead.consentedAt).toBeInstanceOf(Date);
    expect(lead.consentVersion).toMatch(/^privacy-policy-v/);
  });

  test("keeps the form's values behind the dialog, and clears them only once it closes", async ({ page }) => {
    await page.goto(PROJECT_URL);

    const values = await fillEnquiry(page);
    await page.getByRole("button", { name: "Request viewing" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Thank you")).toBeVisible();

    // Values survive behind the open dialog. A visitor who glances past
    // its edge and sees the form already blank cannot tell whether the
    // submission actually went through — the obvious response, pressing
    // submit again, files a duplicate the sales team then calls twice.
    await expect(page.getByLabel("Full name")).toHaveValue(values.name);
    await expect(page.getByLabel("Email address")).toHaveValue(values.email);

    await dialog.getByRole("button", { name: "Close", exact: true }).click();

    await expect(page.getByLabel("Full name")).toHaveValue("");
    await expect(page.getByLabel("Email address")).toHaveValue("");
  });

  test("carries UTM attribution from the landing URL", async ({ page }) => {
    await page.goto(`${PROJECT_URL}?utm_source=google&utm_medium=cpc&utm_campaign=villas-q3`);

    const values = await fillEnquiry(page);
    await page.getByRole("button", { name: "Request viewing" }).click();
    await expect(page.getByRole("dialog").getByText("Thank you")).toBeVisible();

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
    await pickPhoneCountry(page, "Thailand");
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

    // Posted directly: the field is hidden, so only a script fills it. A
    // real client always sends E.164 by the time it reaches this endpoint
    // (CountrySelect.tsx's toE164() assembles it before submit) — a script
    // hitting the API straight past the form is exactly the case
    // leadInquirySchema's regex exists to hold to the same shape.
    const response = await page.request.post("/api/leads", {
      data: {
        name: "Acme Marketing",
        email,
        phone: "+66800000000",
        phoneCountry: "TH",
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

  test("the success dialog is accessible too", async ({ page }) => {
    // Same reasoning as the error state above, for the other dynamic
    // surface this page grows after an interaction — a focus trap, a
    // backdrop and a portal-rendered node axe cannot see by scanning the
    // page before anyone has submitted anything.
    await page.goto(PROJECT_URL);

    await fillEnquiry(page);
    await page.getByRole("button", { name: "Request viewing" }).click();
    await expect(page.getByRole("dialog").getByText("Thank you")).toBeVisible();

    await expectNoA11yViolations(page);
  });

  test("is reachable and submittable by keyboard alone", async ({ page }) => {
    await page.goto(PROJECT_URL);

    const name = page.getByLabel("Full name");

    /*
      Wait for the form to be interactive, not merely present.

      page.goto() resolves on `load`, which on a production build is the
      moment the prerendered HTML arrives — well before React has hydrated
      it. Focus set inside that window does not survive: activeElement
      snaps back to <body>, every keystroke lands nowhere, and the failure
      reads as "phone is empty" rather than "the page was not ready yet".

      Under `next dev` the window does not exist, because compiling the
      route pushes `load` past hydration. CI builds for production, so this
      could only ever fail there — which is exactly what it did.

      Retrying the focus is the gate: it costs one attempt on a page that
      is already hydrated, and needs no arbitrary sleep.
    */
    await expect(async () => {
      await name.focus();
      await expect(name).toBeFocused({ timeout: 500 });
    }).toPass({ timeout: 15_000 });

    // Tab order must run name → phone country code → phone number → email
    // → nationality → message, matching the visual left-to-right order. A
    // grid layout that reorders columns for wide screens is the usual way
    // this silently breaks.
    await page.keyboard.type("Keyboard Buyer");
    await page.keyboard.press("Tab");

    // The country picker itself, entirely by keyboard: a plain <button>
    // opens on Enter or Space with no extra ARIA wiring needed, typing
    // filters the list, and Enter picks whatever is highlighted — see
    // CountrySelect.tsx's onSearchKeyDown for the same sequence this
    // exercises.
    const phoneCountry = page.getByRole("combobox", { name: "Country code" });
    await expect(phoneCountry).toBeFocused();
    await page.keyboard.press("Enter");
    await page.keyboard.type("United Kingdom");
    await page.keyboard.press("Enter");
    // Focus returns to the trigger after a selection, and its own text now
    // reflects the pick — both load-bearing for the next Tab to land
    // correctly and for a sighted keyboard user to get feedback at all.
    await expect(phoneCountry).toBeFocused();
    await expect(phoneCountry).toHaveText(/\+44/);

    await page.keyboard.press("Tab");
    await page.keyboard.type("7400123456");
    await page.keyboard.press("Tab");

    const email = uniqueEmail("keyboard");
    await page.keyboard.type(email);

    await expect(page.getByLabel("Phone number")).toHaveValue("7400123456");
    await expect(page.getByLabel("Email address")).toHaveValue(email);
  });
});
