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
 * Nothing here touches the network: buildObjectKey and toPublicUrl are pure.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_UPLOAD_BYTES,
  MAX_VIDEO_BYTES,
  buildObjectKey,
  getPresignedUploadUrl,
  isAllowedContentType,
  isDocumentContentType,
  maxBytesFor,
  toPublicUrl,
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

describe("toPublicUrl", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.DO_SPACES_REGION = "sgp1";
    process.env.DO_SPACES_BUCKET = "andamanasset-media";
    process.env.DO_SPACES_ACCESS_KEY_ID = "test";
    process.env.DO_SPACES_SECRET_ACCESS_KEY = "test";
    process.env.NEXT_PUBLIC_MEDIA_DOMAIN =
      "andamanasset-media.sgp1.digitaloceanspaces.com";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("builds an https URL on the media host", () => {
    expect(toPublicUrl("projects/a/b.jpg")).toBe(
      "https://andamanasset-media.sgp1.digitaloceanspaces.com/projects/a/b.jpg",
    );
  });

  it("tolerates a scheme pasted into the env var", () => {
    process.env.NEXT_PUBLIC_MEDIA_DOMAIN = "https://cdn.example.com";

    expect(toPublicUrl("a.jpg")).toBe("https://cdn.example.com/a.jpg");
  });

  it("tolerates a trailing slash", () => {
    process.env.NEXT_PUBLIC_MEDIA_DOMAIN = "cdn.example.com/";

    expect(toPublicUrl("a.jpg")).toBe("https://cdn.example.com/a.jpg");
  });

  it("never produces a double slash", () => {
    process.env.NEXT_PUBLIC_MEDIA_DOMAIN = "cdn.example.com/";

    expect(toPublicUrl("/a.jpg").slice("https://".length)).not.toContain("//");
  });

  it("uses the public host, never the signing endpoint", () => {
    // A URL on the API endpoint (sgp1.digitaloceanspaces.com/bucket/key)
    // works for signed requests and not for a visitor's browser.
    expect(toPublicUrl("a.jpg")).toBe(
      "https://andamanasset-media.sgp1.digitaloceanspaces.com/a.jpg",
    );
  });

  it("throws when the media host is not configured", () => {
    delete process.env.NEXT_PUBLIC_MEDIA_DOMAIN;

    expect(() => toPublicUrl("a.jpg")).toThrow("S3_NOT_CONFIGURED");
  });
});

/**
 * Every header the signature covers must also be handed to the browser.
 *
 * This is the invariant that broke, silently and only for PDFs. Signing a
 * PutObject with ContentDisposition puts `content-disposition` into
 * X-Amz-SignedHeaders, but the `headers` map returned to the uploader was
 * written out by hand and listed only Content-Type and x-amz-acl. The
 * browser therefore replayed an incomplete set and DigitalOcean Spaces
 * answered 400 "Missing one or more required signed header" on every
 * brochure upload.
 *
 * It was invisible for three compounding reasons: images and video sign no
 * extra header, so only PDF was affected; a cross-origin error response
 * carries no CORS headers, so the browser reported the 400 to XHR as a
 * network failure with status 0; and the uploader labelled that "likely a
 * CORS rule", which pointed every investigation at the bucket instead.
 *
 * Signing is pure crypto — no network, no real credentials needed.
 */
describe("presigned upload headers", () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.DO_SPACES_REGION = "sgp1";
    process.env.DO_SPACES_BUCKET = "andamanasset-media";
    process.env.DO_SPACES_ACCESS_KEY_ID = "test";
    process.env.DO_SPACES_SECRET_ACCESS_KEY = "test";
    process.env.DO_SPACES_ENDPOINT = "https://sgp1.digitaloceanspaces.com";
    process.env.NEXT_PUBLIC_MEDIA_DOMAIN =
      "andamanasset-media.sgp1.digitaloceanspaces.com";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  /** The headers the URL's signature commits to, `host` aside. */
  function signedHeaders(uploadUrl: string): string[] {
    const raw = new URL(uploadUrl).searchParams.get("X-Amz-SignedHeaders") ?? "";

    return decodeURIComponent(raw)
      .split(";")
      .filter((header) => header.length > 0 && header !== "host");
  }

  const types = Object.keys(ALLOWED_CONTENT_TYPES) as (keyof typeof ALLOWED_CONTENT_TYPES)[];

  it.each(types)("%s sends every header its signature covers", async (contentType) => {
    const presigned = await getPresignedUploadUrl({
      contentType,
      prefix: "projects",
      slug: "trinity-village",
    });

    const sent = Object.keys(presigned.headers).map((header) => header.toLowerCase());
    const missing = signedHeaders(presigned.uploadUrl).filter(
      (header) => !sent.includes(header),
    );

    expect(missing).toEqual([]);
  });

  it("tells the browser to download a PDF rather than render it", async () => {
    // Content-Disposition is what keeps an uploaded PDF out of the site's
    // own origin, so it has to survive as more than a signing detail.
    const presigned = await getPresignedUploadUrl({
      contentType: "application/pdf",
      prefix: "projects",
      slug: "trinity-village",
    });

    expect(presigned.headers["Content-Disposition"]).toBe(
      'attachment; filename="trinity-village-brochure.pdf"',
    );
    expect(signedHeaders(presigned.uploadUrl)).toContain("content-disposition");
  });

  it("adds no such header to an image or a video", async () => {
    for (const contentType of ["image/jpeg", "video/mp4"] as const) {
      const presigned = await getPresignedUploadUrl({ contentType, prefix: "projects" });

      expect(presigned.headers["Content-Disposition"], contentType).toBeUndefined();
    }
  });

  it("always sends the content type and the object ACL", async () => {
    const presigned = await getPresignedUploadUrl({ contentType: "image/webp" });

    expect(presigned.headers["Content-Type"]).toBe("image/webp");
    expect(presigned.headers["x-amz-acl"]).toBe("public-read");
  });
});

describe("size caps by type", () => {
  it("gives video the largest allowance", () => {
    // Untested until now, which is how MAX_VIDEO_BYTES could have drifted
    // from the client-side cap in components/admin/ImageUploader.tsx.
    expect(maxBytesFor("video/mp4")).toBe(MAX_VIDEO_BYTES);
    expect(maxBytesFor("video/webm")).toBe(MAX_VIDEO_BYTES);
    expect(MAX_VIDEO_BYTES).toBeGreaterThan(MAX_DOCUMENT_BYTES);
  });

  it("orders the three caps image < document < video", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(MAX_DOCUMENT_BYTES);
    expect(MAX_DOCUMENT_BYTES).toBeLessThan(MAX_VIDEO_BYTES);
  });
});
