/**
 * tests/structured-media.test.ts
 *
 * VideoObject for progress videos and DigitalDocument for e-brochures.
 */

import { describe, expect, it } from "vitest";
import { brochureDocument, progressVideoObjects, youTubeId } from "@/lib/structured-media";

const PAGE = "https://andamanassetsolution.com/en/projects/victory";

describe("progressVideoObjects", () => {
  it("makes one VideoObject per month with a YouTube link", () => {
    const videos = progressVideoObjects({
      locale: "en",
      projectName: "Victory",
      pageUrl: PAGE,
      updates: [
        { id: "a", year: 2026, month: 9, videoUrl: "https://youtu.be/dQw4w9WgXcQ" },
        { id: "b", year: 2026, month: 10, videoUrl: null },
        { id: "c", year: 2026, month: 11, videoUrl: "https://example.com/video" },
      ],
    });
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      "@type": "VideoObject",
      name: "Victory — September 2026",
      uploadDate: "2026-09-01",
      thumbnailUrl: ["https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"],
      embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
    });
  });

  it("reads ids from watch links", () => {
    expect(youTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3")).toBe("dQw4w9WgXcQ");
  });
});

describe("brochureDocument", () => {
  it("describes the PDF with absolute URLs", () => {
    const doc = brochureDocument({
      locale: "th",
      pageUrl: "https://andamanassetsolution.com/th/e-brochure/victory",
      title: "Victory",
      description: null,
      fileUrl: "/brochures/victory.pdf",
      coverImageUrl: "/brochures/victory.webp",
      updatedAt: new Date("2026-10-01T00:00:00Z"),
      projectName: "Victory",
      publisherName: "Andaman Asset Solution",
      publisherUrl: "https://andamanassetsolution.com",
    });
    expect(doc).not.toHaveProperty("contentUrl");
    expect(doc).toMatchObject({
      "@type": "DigitalDocument",
      encodingFormat: "application/pdf",
      // On a MediaObject: contentUrl is not a DigitalDocument property.
      encoding: {
        "@type": "MediaObject",
        contentUrl: "https://andamanassetsolution.com/brochures/victory.pdf",
        encodingFormat: "application/pdf",
      },
      thumbnailUrl: "https://andamanassetsolution.com/brochures/victory.webp",
    });
    expect(doc).not.toHaveProperty("description");
  });
});
