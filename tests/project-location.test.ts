/**
 * tests/project-location.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The location line under a project's name was one string for all four
 * languages. Each language can now carry its own on ProjectTranslation,
 * and a language without one shows the overview tab's.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique } } }));
vi.mock("@/lib/db", () => ({ safeQuery: (_name: string, fn: () => unknown) => fn(), isDatabaseOffline: () => false }));

const { getProjectBySlug } = await import("@/lib/projects");

const translation = (locale: string, location: string | null) => ({ locale, name: "The Victory", location });

findUnique.mockResolvedValue({
  id: "p1",
  slug: "victory",
  isPublished: true,
  deletedAt: null,
  location: "Cherngtalay, Phuket",
  gallery: [],
  facilities: [],
  translations: [translation("th", "เชิงทะเล ภูเก็ต"), translation("ru", null)],
});

describe("project location line", () => {
  it("is the language's own when it has one", async () => {
    const project = await getProjectBySlug("victory", "th");
    expect(project?.location).toBe("เชิงทะเล ภูเก็ต");
    // Maps and the OG card keep the overview tab's.
    expect(project?.locationBase).toBe("Cherngtalay, Phuket");
  });

  it("falls back to the overview tab's when the language has none", async () => {
    expect((await getProjectBySlug("victory", "ru"))?.location).toBe("Cherngtalay, Phuket");
  });
});
