/**
 * tests/media-ai-alt.test.ts
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/media-usage", () => ({ findMediaUsageForUrls: async () => new Map() }));

import { mergeAlt } from "@/lib/media-ai-alt";

describe("mergeAlt", () => {
  it("fills only empty or too-short languages", () => {
    const merged = mergeAlt(
      { en: "Pool terrace written by a person", th: "", zh: "池" },
      { en: "AI en", th: "AI th", zh: "AI zh", ru: "AI ru" },
    );
    expect(merged).toEqual({ en: "Pool terrace written by a person", th: "AI th", zh: "AI zh", ru: "AI ru" });
  });
});
