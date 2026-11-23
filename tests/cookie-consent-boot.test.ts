/**
 * tests/cookie-consent-boot.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The inline script that hides the server-rendered cookie banner for a
 * browser that has already decided. It is a string, so nothing type-checks
 * it and a typo would only show as a banner flashing on every page for
 * every returning visitor. Run here as the browser would run it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import { CONSENT_BOOT_SCRIPT, CONSENT_STORAGE_KEY } from "@/lib/cookie-consent-boot";

/** Runs the script against a stand-in page; returns whether it marked <html>. */
function run(stored: string | null | Error): boolean {
  const attributes = new Map<string, string>();
  vm.runInNewContext(CONSENT_BOOT_SCRIPT, {
    localStorage: {
      getItem(key: string) {
        if (stored instanceof Error) throw stored;
        return key === CONSENT_STORAGE_KEY ? stored : null;
      },
    },
    document: { documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) } },
  });
  return attributes.has("data-cookie-decided");
}

const decision = (version: string) =>
  JSON.stringify({ analytics: false, marketing: false, version, decidedAt: "2026-11-23T00:00:00.000Z" });

describe("the cookie banner's boot script", () => {
  it("marks the page when a decision under the current version is stored", () => {
    expect(run(decision(siteConfig.legal.consentVersion))).toBe(true);
  });

  it("leaves a first visit alone, so the banner shows", () => {
    expect(run(null)).toBe(false);
  });

  it("leaves a decision made under an older version alone: the banner must ask again", () => {
    expect(run(decision("0000-00-00"))).toBe(false);
  });

  it("survives a corrupted value, a non-object, and storage that throws", () => {
    expect(run("{not json")).toBe(false);
    expect(run("null")).toBe(false);
    expect(run(new Error("SecurityError"))).toBe(false);
  });
});
