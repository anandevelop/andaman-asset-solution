/**
 * tests/icu-skeleton.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The case-by-case copy editor (components/copy/CopyValueField.tsx) must
 * give back exactly what it was given until someone types, and must be
 * able to decompose every counted message the site actually has — those
 * are the strings that showed editors raw ICU before it existed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleSkeleton, icuSkeleton } from "@/lib/icu-skeleton";
import { EDITABLE_NAMESPACES, validateCopy } from "@/lib/site-copy-core";

function flatten(value: unknown, prefix: string, out: Record<string, string>) {
  if (typeof value === "string") out[prefix] = value;
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

const LOCALES = ["th", "en", "zh", "ru"];
const COPY = Object.fromEntries(
  LOCALES.map((locale) => {
    const messages = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8"));
    const out: Record<string, string> = {};
    for (const ns of EDITABLE_NAMESPACES) flatten(messages[ns], ns, out);
    return [locale, out];
  }),
) as Record<string, Record<string, string>>;

const COUNTED = /\{\s*\w+\s*,\s*(plural|selectordinal|select)\s*,/;

describe("icuSkeleton", () => {
  it("splits a plural into its cases and puts it back unchanged", () => {
    const message = "{count, plural, =4 {Four things we do in-house} other {# things we do in-house}}";
    const skeleton = icuSkeleton(message)!;
    expect(skeleton.argument).toBe("count");
    expect(skeleton.slots).toEqual([
      { kind: "case", selector: "=4", text: "Four things we do in-house" },
      { kind: "case", selector: "other", text: "# things we do in-house" },
    ]);
    expect(assembleSkeleton(skeleton, skeleton.slots.map((s) => s.text))).toBe(message);
  });

  it("keeps text after the plural as its own box", () => {
    const message = "{count, plural, =0 {办公室。} other {距离 # 处。}}咖啡我们请。";
    const skeleton = icuSkeleton(message)!;
    expect(skeleton.slots.at(-1)).toEqual({ kind: "after", text: "咖啡我们请。" });
  });

  it("changes only the edited case", () => {
    const message = "{count, plural, =0 {Full} other {# seats left}}";
    const skeleton = icuSkeleton(message)!;
    const texts = skeleton.slots.map((s) => s.text);
    texts[0] = "Sold out";
    expect(assembleSkeleton(skeleton, texts)).toBe("{count, plural, =0 {Sold out} other {# seats left}}");
  });

  it("leaves plain text, plain placeholders and nested plurals alone", () => {
    expect(icuSkeleton("Hello")).toBeNull();
    expect(icuSkeleton("{km} km to the beach")).toBeNull();
    expect(icuSkeleton("{a, plural, other {x}} {b, plural, other {y}}")).toBeNull();
    expect(icuSkeleton("{a, plural, other {{b, select, x {1} other {2}}}}")).toBeNull();
    expect(icuSkeleton("{broken")).toBeNull();
  });

  it.each(LOCALES)("decomposes every counted message in %s, losslessly", (locale) => {
    const counted = Object.entries(COPY[locale]).filter(([, value]) => COUNTED.test(value));
    expect(counted.length).toBeGreaterThan(0);
    for (const [key, value] of counted) {
      const skeleton = icuSkeleton(value);
      expect(skeleton, `${locale}:${key}`).not.toBeNull();
      const texts = skeleton!.slots.map((s) => s.text);
      expect(assembleSkeleton(skeleton!, texts), `${locale}:${key}`).toBe(value);
      // An edit to a case's words stays valid ICU against the default.
      const edited = texts.map((text, i) => (i === 0 ? `${text} ✓` : text));
      expect(validateCopy(value, assembleSkeleton(skeleton!, edited)), `${locale}:${key}`).toBeNull();
    }
  });
});
