/**
 * tests/mcp-media-import.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The background upload, with the download and the bucket replaced: what a
 * file is comes from decoding it, not from what its sender called it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const download = vi.fn();
vi.mock("@/lib/mcp/safe-fetch", () => ({ downloadPublicFile: (...a: unknown[]) => download(...a) }));

const put = vi.fn();
let storage = true;
vi.mock("@/lib/s3", () => ({
  MAX_UPLOAD_BYTES: 15 * 1024 * 1024,
  isS3Configured: () => storage,
  buildObjectKey: (type: string) => `media/ai/x.${type.split("/")[1]}`,
  putS3Object: (a: { key: string }) => { put(a); return Promise.resolve(`https://cdn.test/${a.key}`); },
}));

const create = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { media: { create: (a: unknown) => create(a) } } }));
const alt = vi.fn();
vi.mock("@/lib/media-ai-alt", () => ({ altAfterUpload: (id: string) => alt(id) }));
vi.mock("@/lib/mcp/jobs", () => ({ registerJob: vi.fn() }));

import { importMedia } from "@/lib/mcp/media-import";

const png = () => sharp({ create: { width: 40, height: 30, channels: 3, background: "#888" } }).png().toBuffer();

beforeEach(() => {
  vi.clearAllMocks();
  storage = true;
  create.mockResolvedValue({ id: "m1" });
  alt.mockResolvedValue(undefined);
});

describe("importMedia", () => {
  it("stores a real image with its measured size and the tags and alt text given", async () => {
    const body = await png();
    // Mislabelled on purpose: the stored type is what the bytes are.
    download.mockResolvedValue({ body, contentType: "application/octet-stream", finalUrl: "https://x/a" });

    const result = await importMedia({ url: "https://x/a", tags: ["villa"], altText: { th: "วิลล่า", xx: "ignored" } }, "bot1");

    expect(result).toMatchObject({ mediaId: "m1", mimeType: "image/png", width: 40, height: 30, sizeBytes: body.length });
    expect(put.mock.calls[0][0]).toMatchObject({ contentType: "image/png", key: "media/ai/x.png" });
    expect(create.mock.calls[0][0].data).toMatchObject({ tags: ["villa"], altText: { th: "วิลล่า" }, uploadedBy: "bot1", width: 40, height: 30 });
    expect(alt).toHaveBeenCalledWith("m1");
  });

  it.each([
    ["an HTML page called image/png", Buffer.from("<html><script>alert(1)</script></html>"), "image/png"],
    ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "image/svg+xml"],
    ["nothing at all", Buffer.alloc(0), "image/jpeg"],
  ])("refuses %s and stores nothing", async (_label, body, contentType) => {
    download.mockResolvedValue({ body, contentType, finalUrl: "https://x/a" });
    await expect(importMedia({ url: "https://x/a" }, "bot1")).rejects.toThrow(/NOT_AN_IMAGE|UNSUPPORTED_IMAGE_TYPE/);
    expect(put).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a GIF, which the library does not accept", async () => {
    download.mockResolvedValue({ body: await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer(), contentType: "image/gif", finalUrl: "https://x/a" });
    await expect(importMedia({ url: "https://x/a" }, null)).rejects.toThrow("UNSUPPORTED_IMAGE_TYPE");
    expect(put).not.toHaveBeenCalled();
  });

  it("says so when there is nowhere to store the file", async () => {
    storage = false;
    await expect(importMedia({ url: "https://x/a" }, null)).rejects.toThrow("STORAGE_NOT_CONFIGURED");
    expect(download).not.toHaveBeenCalled();
  });
});
