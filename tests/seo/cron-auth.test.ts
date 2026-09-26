/**
 * tests/seo/cron-auth.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who may trigger a scheduled job.
 *
 * Every /api/cron/* route is a public URL that does real work, so the
 * failure that matters is the permissive one: an unset secret meaning
 * "open" rather than "closed". A forgotten environment variable is the most
 * likely thing to go wrong here, and it must not be the thing that opens
 * the door.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { isAuthorisedCron, readCronSecret } from "@/lib/seo/cron-auth";

describe("isAuthorisedCron", () => {
  it("accepts the right secret", () => {
    expect(isAuthorisedCron("s3cret", "s3cret")).toEqual({ ok: true });
  });

  it("refuses the wrong one", () => {
    expect(isAuthorisedCron("wrong", "s3cret")).toEqual({ ok: false, reason: "denied" });
  });

  it("refuses when none was presented", () => {
    expect(isAuthorisedCron(null, "s3cret")).toEqual({ ok: false, reason: "denied" });
    expect(isAuthorisedCron("", "s3cret")).toEqual({ ok: false, reason: "denied" });
  });

  it("refuses everything when no secret is configured", () => {
    // The direction that matters. "Unconfigured means open" turns one
    // forgotten variable into an endpoint anybody can run.
    expect(isAuthorisedCron("anything", undefined)).toEqual({ ok: false, reason: "unconfigured" });
    expect(isAuthorisedCron("anything", "")).toEqual({ ok: false, reason: "unconfigured" });
    expect(isAuthorisedCron("anything", "   ")).toEqual({ ok: false, reason: "unconfigured" });
    expect(isAuthorisedCron(null, undefined)).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("does not accept a prefix of the secret", () => {
    expect(isAuthorisedCron("s3c", "s3cret").ok).toBe(false);
    expect(isAuthorisedCron("s3cretlonger", "s3cret").ok).toBe(false);
  });

  it("is exact about case and whitespace", () => {
    expect(isAuthorisedCron("S3CRET", "s3cret").ok).toBe(false);
    expect(isAuthorisedCron(" s3cret", "s3cret").ok).toBe(false);
  });
});

describe("readCronSecret", () => {
  it("reads a Bearer header", () => {
    const request = new Request("https://x.test/api/cron/seo-audit", {
      headers: { authorization: "Bearer abc123" },
    });
    expect(readCronSecret(request)).toBe("abc123");
  });

  it("falls back to ?secret= for schedulers that cannot set a header", () => {
    const request = new Request("https://x.test/api/cron/seo-audit?secret=abc123");
    expect(readCronSecret(request)).toBe("abc123");
  });

  it("prefers the header when both are present", () => {
    const request = new Request("https://x.test/api/cron/seo-audit?secret=fromquery", {
      headers: { authorization: "Bearer fromheader" },
    });
    expect(readCronSecret(request)).toBe("fromheader");
  });

  it("ignores a non-Bearer authorization header", () => {
    const request = new Request("https://x.test/api/cron/seo-audit", {
      headers: { authorization: "Basic abc123" },
    });
    expect(readCronSecret(request)).toBeNull();
  });

  it("returns null when there is nothing to read", () => {
    expect(readCronSecret(new Request("https://x.test/api/cron/seo-audit"))).toBeNull();
  });

  it("treats an empty Bearer as nothing rather than as an empty secret", () => {
    const request = new Request("https://x.test/api/cron/seo-audit", {
      headers: { authorization: "Bearer " },
    });
    expect(readCronSecret(request)).toBeNull();
  });
});
