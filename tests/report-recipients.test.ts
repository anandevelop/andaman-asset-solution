/**
 * tests/report-recipients.test.ts
 *
 * The list typed on /admin/reports, and the REPORT_RECIPIENTS fallback.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const row = { value: null as string | null };
vi.mock("@/lib/prisma", () => ({
  prisma: { siteSetting: { findUnique: async () => (row.value === null ? null : { value: row.value }) } },
}));
vi.mock("@/lib/email", () => ({
  reportRecipients: () =>
    (process.env.REPORT_RECIPIENTS ?? "").split(",").map((a) => a.trim()).filter((a) => a.includes("@")),
}));

import { getReportRecipients, parseRecipients } from "@/lib/report-recipients";

describe("parseRecipients", () => {
  it("splits on commas, semicolons and new lines, lower-cases and de-duplicates", () => {
    expect(parseRecipients(" CEO@x.com, sales@x.com;\nceo@x.com ").valid).toEqual(["ceo@x.com", "sales@x.com"]);
  });

  it("reports what is not an address", () => {
    expect(parseRecipients("a@x.com, nope, b@").invalid).toEqual(["nope", "b@"]);
  });
});

describe("getReportRecipients", () => {
  beforeEach(() => {
    row.value = null;
    process.env.REPORT_RECIPIENTS = "env@x.com";
  });

  it("uses the saved list over the environment", async () => {
    row.value = "admin@x.com, other@x.com";
    expect(await getReportRecipients()).toEqual({ recipients: ["admin@x.com", "other@x.com"], source: "admin" });
  });

  it("falls back to REPORT_RECIPIENTS", async () => {
    expect(await getReportRecipients()).toEqual({ recipients: ["env@x.com"], source: "env" });
  });

  it("is empty when neither is set", async () => {
    process.env.REPORT_RECIPIENTS = "";
    expect(await getReportRecipients()).toEqual({ recipients: [], source: null });
  });
});
