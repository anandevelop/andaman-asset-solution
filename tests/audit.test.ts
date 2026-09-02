/**
 * tests/audit.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The decisions the audit trail makes about what to record.
 *
 * The trail exists so that an unexplained change has a name against it, and
 * that only works if it is complete. A missing entry does not read as "this
 * was not logged" — it reads as "nobody did this", which is worse than
 * having no trail at all, because it is believed.
 *
 * So the cases worth testing are the ones where an entry could go missing
 * or be attributed wrongly: an operation not recognised as a write, an
 * upsert recorded as the wrong half, a public form's write picking up an
 * administrator's name, or the log recursing into itself.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import {
  changedFieldsFrom,
  labelFrom,
  normaliseAction,
  shouldAudit,
} from "@/lib/audit/extension";

const ACTOR = { id: "user-1", email: "editor@andaman.test", role: "EDITOR" as const };

describe("shouldAudit", () => {
  it.each(["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"])(
    "records %s",
    (operation) => {
      expect(shouldAudit("Project", operation, ACTOR)).toBe(true);
    },
  );

  it.each(["findMany", "findUnique", "findFirst", "count", "aggregate", "groupBy"])(
    "ignores %s",
    (operation) => {
      // Reading is not an accountability question here, and logging it
      // would bury the writes under page views.
      expect(shouldAudit("Project", operation, ACTOR)).toBe(false);
    },
  );

  it("ignores a write with no administrator behind it", () => {
    // A visitor submitting the lead form, an RSVP, the sign-in path
    // stamping totpLastStep. Recording those would put a name against a
    // change no person made.
    expect(shouldAudit("LeadInquiry", "create", undefined)).toBe(false);
  });

  it("never records itself", () => {
    // Writing the trail through the extension that writes the trail.
    expect(shouldAudit("AuditLog", "create", ACTOR)).toBe(false);
  });

  it("ignores an operation with no model", () => {
    // $queryRaw and friends arrive with model undefined; there is nothing
    // to attribute them to.
    expect(shouldAudit(undefined, "create", ACTOR)).toBe(false);
  });
});

describe("normaliseAction", () => {
  it("resolves an upsert to whichever half it turned out to be", () => {
    // Recorded as "update" on a row that already existed and "create" on
    // one that did not — the distinction the reader is actually after.
    expect(normaliseAction("upsert", true)).toBe("update");
    expect(normaliseAction("upsert", false)).toBe("create");
  });

  it.each([
    ["createMany", "create"],
    ["updateMany", "update"],
    ["deleteMany", "delete"],
  ])("reports %s as %s", (operation, expected) => {
    expect(normaliseAction(operation, false)).toBe(expected);
  });

  it("passes the single-row operations through", () => {
    expect(normaliseAction("create", false)).toBe("create");
    expect(normaliseAction("update", false)).toBe("update");
    expect(normaliseAction("delete", false)).toBe("delete");
  });
});

describe("changedFieldsFrom", () => {
  it("lists the fields an update set, sorted", () => {
    expect(changedFieldsFrom({ data: { title: "x", slug: "y", isPublished: true } })).toEqual([
      "isPublished",
      "slug",
      "title",
    ]);
  });

  it("takes the shape of the first row of a createMany", () => {
    expect(changedFieldsFrom({ data: [{ b: 1, a: 2 }, { b: 3, a: 4 }] })).toEqual(["a", "b"]);
  });

  it("records that a relation was touched, not its contents", () => {
    // "translations" is enough. Walking into the nested upsert would put
    // the copy itself in the audit table.
    expect(changedFieldsFrom({ data: { translations: { upsert: {} } } })).toEqual([
      "translations",
    ]);
  });

  it.each([
    ["a delete, which has no data", { where: { id: "x" } }],
    ["no args at all", undefined],
    ["a null data block", { data: null }],
  ])("returns nothing for %s", (_label, args) => {
    expect(changedFieldsFrom(args)).toEqual([]);
  });
});

describe("labelFrom", () => {
  it("prefers the slug, which is what a URL shows", () => {
    expect(labelFrom({ slug: "trinity-village", name: "Trinity Village" })).toBe(
      "trinity-village",
    );
  });

  it("falls through the naming fields in order", () => {
    expect(labelFrom({ title: "An article" })).toBe("An article");
    expect(labelFrom({ name: "Somchai" })).toBe("Somchai");
    expect(labelFrom({ email: "buyer@example.com" })).toBe("buyer@example.com");
  });

  it("reads the deprecated EN column pairs, which are all some models have", () => {
    // Award carries titleEn and no `title`; leaving these out labelled
    // every award entry with nothing, which the integration test caught.
    expect(labelFrom({ titleEn: "Best Developer 2026" })).toBe("Best Developer 2026");
    expect(labelFrom({ nameEn: "Pool Villa" })).toBe("Pool Villa");
    expect(labelFrom({ questionEn: "Can a foreigner buy?" })).toBe("Can a foreigner buy?");
  });

  it("skips a blank field rather than labelling a row with nothing", () => {
    expect(labelFrom({ slug: "   ", title: "Real title" })).toBe("Real title");
  });

  it("truncates rather than storing an essay", () => {
    // A record's "name" can be a paragraph. The audit table is an index,
    // not a copy.
    expect(labelFrom({ title: "x".repeat(500) })).toHaveLength(200);
  });

  it("returns nothing when there is no readable name", () => {
    expect(labelFrom({ id: "abc", count: 3 })).toBeUndefined();
    expect(labelFrom(null)).toBeUndefined();
    expect(labelFrom({ count: 2 })).toBeUndefined();
  });
});
