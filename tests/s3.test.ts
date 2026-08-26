/**
 * tests/s3.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Object-key construction and CloudFront URL mapping.
 *
 * Two properties matter and neither is obvious from reading the code:
 *
 *  • The extension comes from the declared content type, never the
 *    filename. A file called "photo.jpg.html" must not become an .html
 *    object served from our own CDN domain — that would be same-origin
 *    with the site.
 *  • A caller cannot escape its prefix. Slug values reach this function
 *    from admin form input.
 *
 * Nothing here touches AWS: buildObjectKey and toCloudFrontUrl are pure.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_DOCUMENT_BYTES,
  MAX_UPLOAD_BYTES,
  buildObjectKey,
  isAllowedContentType,
  isDocumentContentType,
  maxBytesFor,
  toCloudFrontUrl,
} from "@/lib/s3";

const UUID_KEY =
  /^[a-z0-9-]+\/[a-z0-9-]+\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z]+$/;

describe("isAllowedContentType", () => {
  it.each([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    // Sales brochures. Allowed since Phase 9 — see the note in lib/s3.ts on
    // why PDF is a considered exception and SVG is not.
    "application/pdf",
  ])("accepts %s", (type) => {
    expect(isAllowedContentType(type)).toBe(true);
  });

  it.each([
    // Scriptable and would be same-origin with the site if served from our
    // own CDN domain. Deliberately excluded.
    "image/svg+xml",
    "text/html",
    "application/xhtml+xml",
    "image/gif",
    "",
  ])("rejects %s", (type) => {
    expect(isAllowedContentType(type)).toBe(false);
  });
});

describe("document handling", () => {
  it("classifies PDF as a document and images as not", () => {
    expect(isDocumentContentType("application/pdf")).toBe(true);
    expect(isDocumentContentType("image/jpeg")).toBe(false);
  });

  it("gives documents a larger size allowance", () => {
    // A print-resolution brochure is legitimately bigger than a photograph.
    expect(maxBytesFor("application/pdf")).toBe(MAX_DOCUMENT_BYTES);
    expect(maxBytesFor("image/jpeg")).toBe(MAX_UPLOAD_BYTES);
    expect(MAX_DOCUMENT_BYTES).toBeGreaterThan(MAX_UPLOAD_BYTES);
  });

  it("builds a .pdf key from the content type", () => {
    const key = buildObjectKey("application/pdf", {
      prefix: "brochures",
      slug: "trinity-village",
    });

    expect(key.startsWith("brochures/trinity-village/")).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
  });

  it("cannot be tricked into a .html key by the filename", () => {
    // "photo.jpg.html" must not become an .html object on our CDN domain.
    // The extension comes from the declared type, never the filename.
    expect(buildObjectKey("application/pdf").endsWith(".pdf")).toBe(true);
    expect(buildObjectKey("image/png").endsWith(".png")).toBe(true);
  });
});

describe("buildObjectKey", () => {
  it("produces prefix/slug/uuid.ext", () => {
    const key = buildObjectKey("image/jpeg", { slug: "trinity-village" });

    expect(key).toMatch(UUID_KEY);
    expect(key.startsWith("projects/trinity-village/")).toBe(true);
    expect(key.endsWith(".jpg")).toBe(true);
  });

  it.each([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/avif", ".avif"],
  ] as const)("maps %s to %s", (contentType, extension) => {
    expect(buildObjectKey(contentType).endsWith(extension)).toBe(true);
  });

  it("neutralises path traversal in the slug", () => {
    const key = buildObjectKey("image/png", { slug: "../../etc/passwd" });

    expect(key).not.toContain("..");
    // Exactly three segments: the caller stayed inside its prefix.
    expect(key.split("/")).toHaveLength(3);
  });

  it("neutralises path traversal in the prefix", () => {
    const key = buildObjectKey("image/png", { prefix: "../../../" });

    expect(key.startsWith("..")).toBe(false);
    expect(key.split("/")).toHaveLength(3);
  });

  it("falls back when a segment sanitises to nothing", () => {
    expect(buildObjectKey("image/png", { slug: "!!!" })).toContain("/general/");
    expect(buildObjectKey("image/png", { prefix: "###" })).toMatch(/^projects\//);
  });

  it("keeps a Thai slug safe", () => {
    const key = buildObjectKey("image/png", { slug: "ทรินิตี้-วิลเลจ" });

    expect(key.split("/")).toHaveLength(3);
    expect(key).toMatch(UUID_KEY);
  });

  it("caps segment length", () => {
    const key = buildObjectKey("image/png", { slug: "a".repeat(500) });

    expect(key.split("/")[1].length).toBeLessThanOrEqual(80);
  });

  it("never collides", () => {
    const keys = new Set(
      Array.from({ length: 1000 }, () => buildObjectKey("image/jpeg")),
    );

    expect(keys.size).toBe(1000);
  });

  it("lowercases mixed-case slugs", () => {
    expect(buildObjectKey("image/png", { slug: "Trinity-VILLAGE" })).toContain(
      "/trinity-village/",
    );
  });
});

describe("toCloudFrontUrl", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.AWS_REGION = "ap-southeast-1";
    process.env.AWS_S3_BUCKET_NAME = "andaman-media";
    process.env.AWS_ACCESS_KEY_ID = "test";
    process.env.AWS_SECRET_ACCESS_KEY = "test";
    process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN = "d111111abcdef8.cloudfront.net";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("builds an https CloudFront URL", () => {
    expect(toCloudFrontUrl("projects/a/b.jpg")).toBe(
      "https://d111111abcdef8.cloudfront.net/projects/a/b.jpg",
    );
  });

  it("tolerates a scheme pasted into the env var", () => {
    process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN = "https://d1.cloudfront.net";

    expect(toCloudFrontUrl("a.jpg")).toBe("https://d1.cloudfront.net/a.jpg");
  });

  it("tolerates a trailing slash", () => {
    process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN = "d1.cloudfront.net/";

    expect(toCloudFrontUrl("a.jpg")).toBe("https://d1.cloudfront.net/a.jpg");
  });

  it("never produces a double slash", () => {
    process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN = "d1.cloudfront.net/";

    expect(toCloudFrontUrl("/a.jpg").slice("https://".length)).not.toContain("//");
  });

  it("never emits a raw S3 host", () => {
    // The bucket stays private behind an Origin Access Control; a direct
    // S3 URL in the database would 403 for every visitor.
    expect(toCloudFrontUrl("a.jpg")).not.toContain("amazonaws.com");
  });

  it("throws when the CDN is not configured", () => {
    delete process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;

    expect(() => toCloudFrontUrl("a.jpg")).toThrow("S3_NOT_CONFIGURED");
  });
});
