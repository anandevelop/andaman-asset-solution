/**
 * tests/settings.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The merge contract in lib/settings.ts, which had no test at all.
 *
 * That module's docblock makes one promise — "config/site.ts is always the
 * fallback" — and it is load-bearing well beyond tidiness: getSiteSettings()
 * is called from the root layout, so anything that throws here takes down
 * every public page, and anything that returns a blank string renders a
 * site with no phone number, no title and no icons.
 *
 * The cases below are the four ways that promise can be broken, and one of
 * them has already happened in production: `prisma.siteSetting` being
 * `undefined` because the client had not been regenerated after the
 * migration. That is a TypeError thrown before any query runs, so safeQuery
 * never sees it — which is exactly why the module carries its own try/catch
 * on top, and why a test that only mocks a rejected query would not have
 * caught it.
 *
 * getSettingsForEditing() and getOverriddenKeys() call readMergedSettings()
 * directly rather than through unstable_cache, so no next/cache mock is
 * needed to reach the behaviour under test.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { siteConfig } from "@/config/site";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

/** Swapped for `{}` by the "stale Prisma client" case below. */
const { prismaMock } = vi.hoisted(() => ({
  prismaMock: { siteSetting: { findMany } } as Record<string, unknown>,
}));

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import {
  SETTING_KEYS,
  defaultSettings,
  getOverriddenKeys,
  getSettingsForEditing,
  isSettingKey,
} from "@/lib/settings";

const rows = (...pairs: [string, string][]) =>
  pairs.map(([key, value]) => ({ key, value }));

beforeEach(() => {
  vi.restoreAllMocks();
  prismaMock.siteSetting = { findMany };
  findMany.mockReset();
  findMany.mockResolvedValue([]);
  // safeQuery logs on failure; the console noise is not the subject.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  prismaMock.siteSetting = { findMany };
});

describe("the default map", () => {
  it("resolves every declared key to a string", () => {
    const defaults = defaultSettings();

    for (const key of SETTING_KEYS) {
      expect(typeof defaults[key], key).toBe("string");
    }
  });

  it("has no duplicate keys", () => {
    expect(new Set(SETTING_KEYS).size).toBe(SETTING_KEYS.length);
  });

  it("recognises a real key and rejects an invented one", () => {
    expect(isSettingKey("contact.phone")).toBe(true);
    expect(isSettingKey("contact.telepathy")).toBe(false);
  });

  it("carries the committed branding paths", () => {
    // The favicon default is what buildIconsMetadata() compares against to
    // decide between the committed icon set and a single custom entry.
    expect(defaultSettings()["branding.faviconUrl"]).toBe(siteConfig.branding.favicon);
    expect(defaultSettings()["branding.ogImageUrl"]).toBe(siteConfig.seo.ogImage);
  });
});

describe("readMergedSettings, through getSettingsForEditing", () => {
  it("returns the committed defaults when the table is empty", async () => {
    expect(await getSettingsForEditing()).toEqual(defaultSettings());
  });

  it("lets a stored row win", async () => {
    findMany.mockResolvedValue(rows(["contact.phone", "+66 76 000 000"]));

    expect((await getSettingsForEditing())["contact.phone"]).toBe("+66 76 000 000");
  });

  it("ignores a key nothing consumes", async () => {
    // A stray row must not be able to change behaviour — that is the whole
    // point of the allowlist.
    findMany.mockResolvedValue(rows(["contact.telepathy", "yes"]));

    expect(await getSettingsForEditing()).toEqual(defaultSettings());
  });

  it("falls back for a whitespace-only value", async () => {
    /* Clearing a field deletes the row, but a row that survived with "  "
       in it must read as "not set" rather than blanking the site. */
    findMany.mockResolvedValue(rows(["contact.phone", "   "]));

    expect((await getSettingsForEditing())["contact.phone"]).toBe(
      siteConfig.contact.phone,
    );
  });

  it("trims a stored value", async () => {
    findMany.mockResolvedValue(rows(["seo.titleTemplate", "  %s | Brand  "]));

    expect((await getSettingsForEditing())["seo.titleTemplate"]).toBe("%s | Brand");
  });

  it("still returns the full default map when the query fails", async () => {
    findMany.mockRejectedValue(new Error("connection refused"));

    expect(await getSettingsForEditing()).toEqual(defaultSettings());
  });

  it("survives a Prisma client that predates the migration", async () => {
    /*
      The failure that actually happened: prisma.siteSetting is undefined,
      so the property access throws a TypeError before any query runs.
      safeQuery cannot help — it catches connection errors, and this is not
      one. The module's own guard is what keeps the site up.
    */
    prismaMock.siteSetting = undefined;

    await expect(getSettingsForEditing()).resolves.toEqual(defaultSettings());
  });
});

describe("getOverriddenKeys", () => {
  it("reports nothing when the table is empty", async () => {
    expect(await getOverriddenKeys()).toEqual([]);
  });

  it("reports a genuinely changed key", async () => {
    findMany.mockResolvedValue(rows(["social.facebook", "https://fb.example/us"]));

    expect(await getOverriddenKeys()).toEqual(["social.facebook"]);
  });

  it("does not report a row whose value equals the default", async () => {
    /*
      This is why the settings action treats "submitted the default" as a
      clear for the image fields: the uploader has to preview the effective
      value, so an untouched save would otherwise write exactly this row —
      inert here, but a stale override the day config/site.ts changes.
    */
    findMany.mockResolvedValue(rows(["contact.phone", siteConfig.contact.phone]));

    expect(await getOverriddenKeys()).toEqual([]);
  });
});
