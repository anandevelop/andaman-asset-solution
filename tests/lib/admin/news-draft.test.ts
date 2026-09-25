/**
 * @vitest-environment jsdom
 */
/**
 * tests/lib/admin/news-draft.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * §7.1's recovery rule, which is the part of draft autosave that can be
 * quietly wrong in both directions: offering to restore text that is
 * already saved (every reload, forever) or failing to offer real work back
 * after a crash.
 *
 * Both conditions have to hold. "Newer than the server" alone is not
 * enough, because saving writes the same text the draft holds and leaves
 * the draft newer by a second or two.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDraft,
  draftDiffers,
  draftKey,
  isRecoverable,
  readDraft,
  writeDraft,
  type NewsDraftValues,
} from "@/lib/admin/news-draft";

const SERVER: NewsDraftValues = {
  title: "Saved title",
  slug: "saved",
  content: "<p>Saved body.</p>",
  metaTitle: "",
  metaDescription: "",
  focusKeyword: "",
};

beforeEach(() => window.localStorage.clear());

describe("news-draft — storage", () => {
  it("keys a draft by article and locale, so language tabs cannot cross", () => {
    expect(draftKey("abc", "th")).not.toBe(draftKey("abc", "en"));

    writeDraft("abc", "th", { ...SERVER, content: "<p>ไทย</p>" });
    expect(readDraft("abc", "th")?.values.content).toBe("<p>ไทย</p>");
    expect(readDraft("abc", "en")).toBeNull();
  });

  it("stamps the draft so it can be compared against the server's copy", () => {
    writeDraft("abc", "en", SERVER);
    const saved = readDraft("abc", "en");
    expect(Number.isNaN(Date.parse(saved?.savedAt ?? ""))).toBe(false);
  });

  it("clears a draft", () => {
    writeDraft("abc", "en", SERVER);
    clearDraft("abc", "en");
    expect(readDraft("abc", "en")).toBeNull();
  });

  it("treats unparseable storage as absent rather than trusting it", () => {
    // This is a value anyone with devtools can write.
    window.localStorage.setItem(draftKey("abc", "en"), "not json");
    expect(readDraft("abc", "en")).toBeNull();

    window.localStorage.setItem(draftKey("abc", "en"), JSON.stringify({ savedAt: 5 }));
    expect(readDraft("abc", "en")).toBeNull();

    window.localStorage.setItem(
      draftKey("abc", "en"),
      JSON.stringify({ savedAt: new Date().toISOString(), values: { title: "x" } }),
    );
    expect(readDraft("abc", "en")).toBeNull();
  });
});

describe("news-draft — whether to offer a recovery", () => {
  const older = "2026-01-01T00:00:00.000Z";
  const newer = "2026-01-02T00:00:00.000Z";

  it("offers a draft that is both newer and different", () => {
    const draft = { savedAt: newer, values: { ...SERVER, content: "<p>Newer work.</p>" } };
    expect(isRecoverable(draft, older, SERVER)).toBe(true);
  });

  it("does not offer a draft older than the saved article", () => {
    const draft = { savedAt: older, values: { ...SERVER, content: "<p>Stale.</p>" } };
    expect(isRecoverable(draft, newer, SERVER)).toBe(false);
  });

  it("does not offer a draft that matches what was saved", () => {
    // The case that would otherwise fire on every reload after a save: the
    // draft is written a moment after the server row, so it is newer, but
    // it holds exactly the text that was saved.
    const draft = { savedAt: newer, values: { ...SERVER } };
    expect(isRecoverable(draft, older, SERVER)).toBe(false);
  });

  it("offers anything stored for an article the server has never saved", () => {
    const draft = { savedAt: newer, values: { ...SERVER, title: "Typed but never saved" } };
    expect(isRecoverable(draft, null, SERVER)).toBe(true);
  });

  it("offers nothing when there is no draft", () => {
    expect(isRecoverable(null, older, SERVER)).toBe(false);
  });

  it("ignores a draft with an unusable timestamp", () => {
    const draft = { savedAt: "whenever", values: { ...SERVER, content: "<p>x</p>" } };
    expect(isRecoverable(draft, older, SERVER)).toBe(false);
  });

  it("notices a change in any recoverable field, not just the body", () => {
    for (const field of Object.keys(SERVER) as (keyof NewsDraftValues)[]) {
      expect(draftDiffers({ ...SERVER, [field]: "changed" }, SERVER)).toBe(true);
    }
    expect(draftDiffers({ ...SERVER }, SERVER)).toBe(false);
  });
});
