/**
 * tests/audit-changes.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * changesBetween — what an audit entry records about a write.
 *
 * This is the function that made "revert" possible, and the one that has
 * to keep two promises: it records only fields whose value genuinely
 * differs (a form that submits thirty inputs and changes one must record
 * one), and it never lets an oversized value through whole.
 *
 * The customer-data exclusion is enforced by the caller, not here — see
 * the extension, which passes no `before` row for those models at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  changesBetween,
  MAX_AUDIT_VALUE_CHARS,
  TRUNCATION_MARKER,
} from "@/lib/audit/extension";

describe("changesBetween", () => {
  it("records a field that actually changed", () => {
    expect(changesBetween(["tagline"], { tagline: "old" }, { tagline: "new" })).toEqual({
      tagline: { before: "old", after: "new" },
    });
  });

  it("ignores a field set to the value it already had", () => {
    expect(changesBetween(["tagline"], { tagline: "same" }, { tagline: "same" })).toBeNull();
  });

  it("keeps only the fields that moved, out of everything the form sent", () => {
    const before = { name: "A", tagline: "B", location: "C" };
    const after = { name: "A", tagline: "CHANGED", location: "C" };

    expect(changesBetween(["name", "tagline", "location"], before, after)).toEqual({
      tagline: { before: "B", after: "CHANGED" },
    });
  });

  it("treats filling in and clearing a field as real changes", () => {
    expect(changesBetween(["tagline"], { tagline: null }, { tagline: "set" })).toEqual({
      tagline: { before: null, after: "set" },
    });
    expect(changesBetween(["tagline"], { tagline: "was" }, { tagline: null })).toEqual({
      tagline: { before: "was", after: null },
    });
  });

  it("skips relation writes, which have no comparable scalar", () => {
    // `translations: { upsert: ... }` is named in changedFields but never
    // appears on the returned row.
    expect(changesBetween(["translations"], { name: "A" }, { name: "A" })).toBeNull();
  });

  it("truncates a value too long to store, and marks it", () => {
    const long = "x".repeat(MAX_AUDIT_VALUE_CHARS + 500);
    const result = changesBetween(["description"], { description: "short" }, { description: long });
    const after = (result as Record<string, { after: string }>).description.after;

    expect(after.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(after.length).toBeLessThan(long.length);
  });

  it("returns null when there is no prior row to compare against", () => {
    // Creates and bulk writes take this path.
    expect(changesBetween(["name"], null, { name: "new" })).toBeNull();
  });

  it("compares dates by their instant, not their identity", () => {
    const a = new Date("2026-09-06T10:00:00Z");
    const b = new Date("2026-09-06T10:00:00Z");
    expect(changesBetween(["followUpAt"], { followUpAt: a }, { followUpAt: b })).toBeNull();
  });
});

describe("credentials never enter the trail", () => {
  it("records no value for a password hash or an authenticator secret", async () => {
    const { changesBetween, SECRET_FIELDS } = await import("@/lib/audit/extension");

    const before = { name: "Anan", passwordHash: "$2b$12$old", totpSecret: "v1:aaa:bbb:ccc", totpEnabledAt: null };
    const after = { name: "Anan K.", passwordHash: "$2b$12$new", totpSecret: null, totpEnabledAt: null };
    const changes = changesBetween(["name", "passwordHash", "totpSecret"], before, after);

    // The name is recorded; the two credentials are not, in either direction.
    expect(changes).toEqual({ name: { before: "Anan", after: "Anan K." } });
    expect(JSON.stringify(changes)).not.toMatch(/\$2b|v1:/);
    for (const field of ["passwordHash", "totpSecret", "codeHash", "refresh_token"]) expect(SECRET_FIELDS.has(field)).toBe(true);
  });

  it("records nothing at all when only a credential changed", async () => {
    const { changesBetween } = await import("@/lib/audit/extension");
    expect(changesBetween(["passwordHash"], { passwordHash: "a" }, { passwordHash: "b" })).toBeNull();
  });

  it("hides the value of a secret setting, and only of a secret setting", async () => {
    const { changesBetween } = await import("@/lib/audit/extension");

    expect(
      changesBetween(["value"], { key: "secret:line.accessToken", value: "v1:old" }, { key: "secret:line.accessToken", value: "v1:new" }),
    ).toBeNull();
    expect(
      changesBetween(["value"], { key: "contact.phone", value: "+66 91" }, { key: "contact.phone", value: "+66 95" }),
    ).toEqual({ value: { before: "+66 91", after: "+66 95" } });
  });
});
