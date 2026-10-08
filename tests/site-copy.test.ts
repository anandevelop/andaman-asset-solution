/**
 * tests/site-copy.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rules that decide whether an admin's copy override reaches the page
 * (lib/site-copy-core.ts). Each one stands between a typo in /admin and a
 * public page that errors at render time, so each gets a case.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "@/messages/en.json";
import th from "@/messages/th.json";
import {
  ALL_COPY_NAMESPACES,
  EDITABLE_NAMESPACES,
  applyCopyOverrides,
  copyMatches,
  flattenMessages,
  isEditableKey,
  placeholdersOf,
  validateCopy,
} from "@/lib/site-copy-core";
import { allCopyDefaults, contentCopyDefaults } from "@/lib/site-copy-content";
import { COPY_NAMESPACE_PATH, COPY_PAGE_GROUPS, copyKind, copySubgroup } from "@/lib/site-copy-meta";

describe("applyCopyOverrides", () => {
  const messages = {
    home: { corporate: { eyebrow: "Corporate", title: "Four things" } },
    admin: { common: { save: "Save" } },
  };

  it("replaces an existing public key and leaves the rest alone", () => {
    const out = applyCopyOverrides(messages, { "home.corporate.eyebrow": "บริษัท" });
    expect(out.home.corporate).toEqual({ eyebrow: "บริษัท", title: "Four things" });
    expect(out.admin).toBe(messages.admin);
  });

  it("does not mutate the loaded messages", () => {
    applyCopyOverrides(messages, { "home.corporate.eyebrow": "X" });
    expect(messages.home.corporate.eyebrow).toBe("Corporate");
  });

  it("ignores keys the JSON does not have, so a stale row cannot add copy", () => {
    const out = applyCopyOverrides(messages, { "home.corporate.gone": "X", "home.nope.deep": "Y" });
    expect(out).toBe(messages);
  });

  it("ignores a key that names a branch rather than a string", () => {
    expect(applyCopyOverrides(messages, { "home.corporate": "X" })).toBe(messages);
  });

  it("never touches the admin's own chrome", () => {
    expect(applyCopyOverrides(messages, { "admin.common.save": "X" })).toBe(messages);
  });

  it("treats a blank override as no override", () => {
    expect(applyCopyOverrides(messages, { "home.corporate.title": "   " })).toBe(messages);
  });
});

describe("content trees (content/*.ts)", () => {
  it("overrides one paragraph and keeps the array an array", () => {
    const tree = { privacyPolicy: { intro: ["a", "b"], sections: [{ heading: "1. X", bullets: ["p", "q"] }] } };
    const out = applyCopyOverrides(tree, {
      "privacyPolicy.intro.1": "B",
      "privacyPolicy.sections.0.bullets.0": "P",
    });
    expect(Array.isArray(out.privacyPolicy.intro)).toBe(true);
    expect(out.privacyPolicy.intro).toEqual(["a", "B"]);
    expect(out.privacyPolicy.sections[0].bullets).toEqual(["P", "q"]);
    expect(tree.privacyPolicy.intro).toEqual(["a", "b"]);
  });

  it("ignores an index past the end of the list", () => {
    const tree = { terms: { intro: ["a"] } };
    expect(applyCopyOverrides(tree, { "terms.intro.5": "X" })).toBe(tree);
  });

  it("never offers a policy's version or effective date for editing", async () => {
    const all = await allCopyDefaults("th");
    expect(all["privacyPolicy.title"]).toBeTruthy();
    expect(all["achievementsPage.intro.heading"]).toBeTruthy();
    for (const ns of ["privacyPolicy", "terms"]) {
      expect(all).not.toHaveProperty(`${ns}.version`);
      expect(all).not.toHaveProperty(`${ns}.effectiveDate`);
      expect(all).not.toHaveProperty(`${ns}.contactPhone.tel`);
    }
    expect(all).not.toHaveProperty("admin.common.save");
  });

  it("has the same content keys in every locale, so an override never lands on nothing", () => {
    const keys = (locale: string) =>
      Object.keys(flattenMessages(contentCopyDefaults(locale))).sort();
    for (const locale of ["th", "zh", "ru"]) expect(keys(locale), locale).toEqual(keys("en"));
  });
});

describe("validateCopy", () => {
  const plural = "{count, plural, =4 {Four things we do in-house} other {# things we do in-house}}";

  it("accepts plain text in place of an ICU message", () => {
    expect(validateCopy(plural, "สี่งานที่เราทำเอง")).toBeNull();
  });

  it("accepts a rewrite that keeps the same argument", () => {
    expect(validateCopy(plural, "{count, plural, other {# services}}")).toBeNull();
  });

  it("rejects broken syntax", () => {
    expect(validateCopy("Hello", "Hello {")).toEqual({ code: "SYNTAX" });
  });

  it("rejects an argument the component never passes", () => {
    expect(validateCopy("Our team", "Our {count} people")).toEqual({
      code: "UNKNOWN_ARGUMENT",
      name: "count",
    });
  });

  it("rejects a rich-text tag the component has no renderer for", () => {
    expect(validateCopy("Read <link>more</link>", "Read <b>more</b>")).toEqual({
      code: "UNKNOWN_TAG",
      name: "b",
    });
  });

  it("allows dropping a tag the default has", () => {
    expect(validateCopy("Read <link>more</link>", "Read more")).toBeNull();
  });
});

describe("placeholdersOf", () => {
  it("lists arguments and tags", () => {
    expect(placeholdersOf("{n} <link>x</link>")).toEqual({ args: ["n"], tags: ["link"] });
  });
});

describe("the real message files", () => {
  it("has every editable namespace in every locale", () => {
    for (const name of EDITABLE_NAMESPACES) {
      expect(en, name).toHaveProperty(name);
      expect(th, name).toHaveProperty(name);
    }
  });

  it("keeps admin and auth out of reach", () => {
    expect(isEditableKey("admin.common.save")).toBe(false);
    expect(isEditableKey("auth.signIn")).toBe(false);
    expect(isEditableKey("home.corporate.title")).toBe(true);
  });

  /* Every default must be acceptable as its own override, or the editor
     would refuse to save a section somebody only opened. */
  it("accepts each default as an override of itself", () => {
    const all = flattenMessages(en);
    for (const [key, value] of Object.entries(all)) {
      if (!isEditableKey(key)) continue;
      expect(validateCopy(value, value), key).toBeNull();
    }
  });

  it("renders the overridden corporate heading through next-intl", () => {
    const messages = applyCopyOverrides(en, {
      "home.corporate.title": "What we do",
    });
    const t = createTranslator({ locale: "en", messages, namespace: "home.corporate" });
    expect(t("title", { count: 4 })).toBe("What we do");
  });
});

describe("copyMatches (the picker on the public site)", () => {
  it("matches plain text, ignoring spacing and case", () => {
    expect(copyMatches("Getting here", "  getting   HERE ")).toBe(true);
    expect(copyMatches("Getting here", "Getting there")).toBe(false);
  });

  it("lets a filled-in value stand for an argument", () => {
    expect(copyMatches("{km} km from you", "12.4 km from you")).toBe(true);
    expect(copyMatches("เปิดอยู่ · ปิด {time} น.", "เปิดอยู่ · ปิด 18:00 น.")).toBe(true);
    expect(copyMatches("{km} km from you", "12.4 km from the office")).toBe(false);
  });

  it("reads rich-text tags as the words inside them", () => {
    expect(copyMatches("Four <b>things</b> we do", "Four things we do")).toBe(true);
  });

  it("never lets a message that is only a placeholder match everything", () => {
    expect(copyMatches("{count}", "anything at all")).toBe(false);
  });

  it("treats content text as plain, braces included", () => {
    expect(copyMatches("Section {1}", "Section 2", false)).toBe(false);
    expect(copyMatches("Section {1}", "Section {1}", false)).toBe(true);
  });
});

describe("site-copy-meta", () => {
  it("puts every namespace in exactly one sidebar group", () => {
    const grouped = COPY_PAGE_GROUPS.flatMap((group) => [...group.namespaces]);
    expect([...grouped].sort()).toEqual([...ALL_COPY_NAMESPACES].sort());
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("has a page to open for every namespace", () => {
    for (const name of ALL_COPY_NAMESPACES) expect(COPY_NAMESPACE_PATH[name]).toMatch(/^\//);
  });

  it("guesses the kind of a key from its name", () => {
    expect(copyKind("home.corporate.title", "Four things")).toBe("heading");
    expect(copyKind("home.corporate.eyebrow", "Corporate")).toBe("eyebrow");
    expect(copyKind("map.openRoute", "Open route")).toBe("button");
    expect(copyKind("map.declined", "Location permission was declined")).toBe("message");
    expect(copyKind("leadForm.emailPlaceholder", "you@example.com")).toBe("placeholder");
    expect(copyKind("privacyPolicy.sections.2.bullets.1", "x".repeat(200))).toBe("paragraph");
  });

  it("groups keys by their second segment", () => {
    expect(copySubgroup("home.corporate.title")).toBe("corporate");
    expect(copySubgroup("map.howFar")).toBe("");
  });
});
