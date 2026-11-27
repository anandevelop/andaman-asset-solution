/**
 * e2e/prime-sessions.spec.ts
 * ─────────────────────────────────────────────────────────────────────────
 * THE PRIME SESSIONS invitation, end to end: the card stands alone (no
 * site chrome, not indexed), "Kindly reply" opens the form, a reply is
 * kept on the event's registrations, and replying again from the same
 * number replaces it rather than adding a second row.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "../lib/prisma-adapter";
import { expect, test } from "./harness";
import { expectNoA11yViolations } from "./a11y";
import { PRIME_SESSIONS, primeRepliesOpen } from "../lib/prime-sessions";

test.setTimeout(120_000);
test.describe.configure({ mode: "serial" });

let client: PrismaClient | null = null;
const db = () => (client ??= new PrismaClient({ adapter: pgAdapter(process.env.E2E_DATABASE_URL) }));
test.afterAll(async () => {
  await client?.$disconnect();
});

const PHONE = "891 234 567";
const STORED_PHONE = "+66891234567";

test("the invitation stands alone and is not indexed", async ({ page }) => {
  await page.goto("/en/prime-sessions");

  await expect(page.getByRole("heading", { level: 1, name: "THE PRIME SESSIONS" })).toBeVisible();
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("contentinfo")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main menu" })).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);

  const languages = page.getByRole("navigation", { name: "Language" });
  await expect(languages.getByRole("link")).toHaveCount(4);
  await expect(languages.getByRole("link", { name: "TH" })).toHaveAttribute("href", "/th/prime-sessions");

  await expectNoA11yViolations(page);
});

test("an agency replies, then changes its answer from the same number", async ({ page }) => {
  test.skip(!primeRepliesOpen(), "replies closed at noon on 12 December 2026");

  await page.goto("/en/prime-sessions");
  await page.getByRole("button", { name: /Kindly reply/ }).click();

  // Nothing filled in: every required field says so.
  await page.getByRole("button", { name: /Send response/ }).click();
  await expect(page.getByText("Please fill this in")).toHaveCount(2);
  await expect(page.getByText("Please choose one")).toBeVisible();

  await page.getByLabel("Agency name *").fill("Andaman E2E Realty");
  await page.getByLabel("Contact person *").fill("Narin Primetest");
  await page.getByRole("textbox", { name: "Phone or WhatsApp *" }).fill(PHONE);
  await page.getByText("Planning to attend").click();
  await page.getByRole("button", { name: "+1" }).click();
  await page.getByRole("button", { name: "+1" }).click();
  await page.getByLabel(/Dietary requirements/).fill("No pork");
  await page.getByRole("checkbox").check();
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: /Send response/ }).click();

  await expect(page.getByText("You’re on the list")).toBeVisible();
  await expect(page.getByText("Andaman E2E Realty")).toBeVisible();

  const event = await db().event.findUniqueOrThrow({ where: { slug: PRIME_SESSIONS.slug } });
  const first = await db().eventRegistration.findMany({ where: { eventId: event.id, phone: STORED_PHONE } });
  expect(first).toHaveLength(1);
  expect(first[0]).toMatchObject({
    email: null,
    agencyName: "Andaman E2E Realty",
    attendance: "ATTENDING",
    partySize: 3,
    dietary: "No pork",
    status: "PENDING",
  });

  // Plans change: the same number answers "Unable to attend".
  await page.getByRole("button", { name: /Back to the invitation/ }).click();
  await page.getByRole("button", { name: /Kindly reply/ }).click();
  await page.getByText("Unable to attend").click();
  await expect(page.getByRole("group", { name: /Expected guests/ })).toBeHidden();
  await page.getByRole("button", { name: /Send response/ }).click();
  await expect(page.getByText("Reply received")).toBeVisible();

  const after = await db().eventRegistration.findMany({ where: { eventId: event.id, phone: STORED_PHONE } });
  expect(after).toHaveLength(1);
  expect(after[0]).toMatchObject({ attendance: "DECLINED", partySize: 0, status: "CANCELLED" });

  await db().eventRegistration.deleteMany({ where: { eventId: event.id, phone: STORED_PHONE } });
});
