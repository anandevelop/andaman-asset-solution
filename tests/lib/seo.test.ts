/**
 * tests/lib/seo.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * lib/seo.ts turns a stored branding setting into a URL or an icon block.
 *
 * Two of its behaviours are load-bearing and neither is visible from
 * reading a call site:
 *
 *   • absoluteAssetUrl() has to refuse a protocol-relative "//host/x.png"
 *     rather than join it. Browsers read that as absolute, naive
 *     concatenation reads it as a path, and the gap between those two
 *     readings is how an og:image ends up serving a stranger's image under
 *     our name.
 *   • buildIconsMetadata() has to emit exactly one <link rel="icon"> once a
 *     custom icon is set. Leaving the committed /favicon.ico beside it
 *     looks harmless and is the whole bug: browsers pick between competing
 *     icon links by their own heuristics, so an operator uploads a mark and
 *     roughly half of them keep seeing the old one.
 *
 * The default branch is asserted by deep equality against what the layout
 * hardcoded before this module existed — that is the regression test for
 * "nothing changed for a site that never touches the setting".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it } from "vitest";
import { siteConfig } from "@/config/site";
import {
  absoluteAssetUrl,
  buildIconsMetadata,
  buildManifestIcons,
  isAbsoluteHttpUrl,
} from "@/lib/seo";

const BASE = "https://example.test";
const CUSTOM = "https://cdn.example.test/branding/site/abc-123.png";

describe("isAbsoluteHttpUrl", () => {
  it.each(["https://a.test/x.png", "http://a.test/x.png", "HTTPS://A.TEST/x.png"])(
    "%s is absolute",
    (value) => {
      expect(isAbsoluteHttpUrl(value)).toBe(true);
    },
  );

  it.each(["/x.png", "x.png", "//a.test/x.png", "data:image/png;base64,AA", ""])(
    "%s is not absolute",
    (value) => {
      expect(isAbsoluteHttpUrl(value)).toBe(false);
    },
  );
});

describe("absoluteAssetUrl", () => {
  it("joins a /public path onto the base", () => {
    expect(absoluteAssetUrl("/og-image.jpg", BASE)).toBe(`${BASE}/og-image.jpg`);
  });

  it("passes an absolute URL through untouched", () => {
    expect(absoluteAssetUrl(CUSTOM, BASE)).toBe(CUSTOM);
  });

  it("adds the missing leading slash", () => {
    expect(absoluteAssetUrl("og-image.jpg", BASE)).toBe(`${BASE}/og-image.jpg`);
  });

  it("does not double the slash when the base carries one", () => {
    expect(absoluteAssetUrl("/og-image.jpg", "https://example.test/")).toBe(
      `${BASE}/og-image.jpg`,
    );
  });

  it.each([["", "empty"], ["   ", "whitespace"]])(
    "returns empty for %s (%s)",
    (value) => {
      expect(absoluteAssetUrl(value, BASE)).toBe("");
    },
  );

  it.each([null, undefined])("returns empty for %s", (value) => {
    expect(absoluteAssetUrl(value, BASE)).toBe("");
  });

  it("refuses a protocol-relative URL rather than guessing at it", () => {
    // The one case where joining and not joining are both wrong.
    expect(absoluteAssetUrl("//evil.example/x.png", BASE)).toBe("");
  });

  it("defaults the base to the configured site URL", () => {
    expect(absoluteAssetUrl("/og-image.jpg")).toBe(`${siteConfig.url}/og-image.jpg`);
  });

  it("trims before deciding", () => {
    expect(absoluteAssetUrl(`  ${CUSTOM}  `, BASE)).toBe(CUSTOM);
  });
});

describe("buildIconsMetadata", () => {
  /* Byte-for-byte what app/[locale]/layout.tsx declared before lib/seo.ts
     existed. If this drifts, every browser tab drifts with it. */
  const COMMITTED = {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon.ico"],
  };

  it("returns the committed set when the setting still holds the default", () => {
    expect(buildIconsMetadata(siteConfig.branding.favicon)).toEqual(COMMITTED);
  });

  it("returns the committed set for a blank setting", () => {
    // A cleared row resolves to the default upstream, but the builder must
    // not produce an empty <link rel="icon"> if it ever sees "" directly.
    expect(buildIconsMetadata("")).toEqual(COMMITTED);
  });

  it("emits exactly one icon entry for a custom icon", () => {
    const icons = buildIconsMetadata(CUSTOM);

    expect(icons).toEqual({
      icon: [{ url: CUSTOM, type: "image/png" }],
      apple: [{ url: CUSTOM }],
      shortcut: [CUSTOM],
    });
  });

  it("leaves the committed favicon out entirely once one is uploaded", () => {
    // The negative assertion is the point: a second icon link is what makes
    // the upload look like it did not work.
    expect(JSON.stringify(buildIconsMetadata(CUSTOM))).not.toContain("favicon.ico");
  });

  it("declares no size it cannot know", () => {
    const [icon] = buildIconsMetadata(CUSTOM).icon;

    expect(icon.sizes).toBeUndefined();
  });
});

describe("buildManifestIcons", () => {
  it("returns the three committed entries by default", () => {
    expect(buildManifestIcons(siteConfig.branding.favicon)).toEqual([
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ]);
  });

  it("keeps the committed maskable icon when a custom one is set", () => {
    /* An operator upload is a square logo, not artwork fitted to Android's
       safe zone. Promoting it to maskable crops it on every launcher. */
    const icons = buildManifestIcons(CUSTOM) ?? [];
    const maskable = icons.filter((icon) => icon.purpose === "maskable");

    expect(maskable).toHaveLength(1);
    expect(maskable[0]?.src).toBe(siteConfig.branding.iconMaskable);
  });

  it("uses the custom icon for the non-maskable entry", () => {
    const icons = buildManifestIcons(CUSTOM) ?? [];
    const any = icons.filter((icon) => icon.purpose === "any");

    expect(any).toHaveLength(1);
    expect(any[0]?.src).toBe(CUSTOM);
  });
});
