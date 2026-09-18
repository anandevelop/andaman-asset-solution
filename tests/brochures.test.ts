/**
 * tests/brochures.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The e-brochure read model.
 *
 * Prisma is the only boundary stubbed. getTranslation and pickLocale run
 * for real, because the regression worth catching here is a Chinese
 * visitor quietly served English — which a mocked translation chain would
 * hide, and which no type would catch.
 *
 * The other property under test is that an unreachable database degrades
 * to an empty catalogue rather than a 500. safeQuery owns that, but it
 * only works if these functions are wired into it, and "wired into
 * safeQuery" is not something the type system can see.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import {
  getBrochureBySlug,
  getBrochureSitemapEntries,
  getPublishedBrochureSlugs,
  getPublishedBrochures,
} from "@/lib/brochures";

const { brochureFindMany, brochureFindFirst, projectFindMany } = vi.hoisted(() => ({
  brochureFindMany: vi.fn(),
  brochureFindFirst: vi.fn(),
  projectFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    eBrochure: { findMany: brochureFindMany, findFirst: brochureFindFirst },
    project: { findMany: projectFindMany },
  },
}));

beforeEach(() => {
  brochureFindMany.mockReset();
  brochureFindFirst.mockReset();
  projectFindMany.mockReset();
});

/** A row shaped like the `select` in lib/brochures.ts. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "b1",
  slug: "trinity-village",
  fileUrl: "https://cdn.example.com/brochures/trinity/abc.pdf",
  coverImageUrl: null,
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  translations: [
    { locale: "en", title: "Trinity Village", description: "A quiet enclave." },
    { locale: "th", title: "ทรินิตี้ วิลเลจ", description: "ชุมชนเงียบสงบ" },
  ],
  project: null,
  ...over,
});

/** The connection-class failure safeQuery is meant to swallow. */
function offline() {
  return new Prisma.PrismaClientInitializationError(
    "Can't reach database server",
    "5.22.0",
    "P1001",
  );
}

describe("getPublishedBrochures", () => {
  it("asks only for published rows, in display order", async () => {
    brochureFindMany.mockResolvedValue([row()]);

    await getPublishedBrochures("en");

    const args = brochureFindMany.mock.calls[0][0];
    expect(args.where).toEqual({ isPublished: true });
    expect(args.orderBy).toEqual([{ sortOrder: "asc" }, { createdAt: "asc" }]);
  });

  it("resolves the title for the requested locale", async () => {
    brochureFindMany.mockResolvedValue([row()]);

    const [brochure] = await getPublishedBrochures("th");

    expect(brochure.title).toBe("ทรินิตี้ วิลเลจ");
    expect(brochure.description).toBe("ชุมชนเงียบสงบ");
  });

  it("falls back to English for a locale with no translation row", async () => {
    // The realistic state of a freshly added brochure: en and th filled
    // in, zh and ru not yet. A Chinese visitor should read English, not
    // an empty card.
    brochureFindMany.mockResolvedValue([row()]);

    const [brochure] = await getPublishedBrochures("zh");

    expect(brochure.title).toBe("Trinity Village");
  });

  it("returns an empty title rather than throwing when nothing is translated", async () => {
    brochureFindMany.mockResolvedValue([row({ translations: [] })]);

    const [brochure] = await getPublishedBrochures("en");

    expect(brochure.title).toBe("");
  });

  it("degrades to an empty catalogue when the database is unreachable", async () => {
    brochureFindMany.mockRejectedValue(offline());

    await expect(getPublishedBrochures("en")).resolves.toEqual([]);
  });

  it("still throws on a query bug", async () => {
    // safeQuery's scope is deliberately narrow: a connection failure is
    // degraded, a broken select is not.
    brochureFindMany.mockRejectedValue(new TypeError("bad select"));

    await expect(getPublishedBrochures("en")).rejects.toThrow();
  });
});

describe("project name resolution", () => {
  const withProject = (translations: { locale: string; name: string }[]) =>
    row({
      project: {
        slug: "trinity-village",
        nameEn: "Trinity Village",
        nameTh: "ทรินิตี้ วิลเลจ",
        translations,
      },
    });

  it("uses the project's own translation when there is one", async () => {
    brochureFindMany.mockResolvedValue([
      withProject([{ locale: "ru", name: "Тринити Виллидж" }]),
    ]);

    const [brochure] = await getPublishedBrochures("ru");

    expect(brochure.projectName).toBe("Тринити Виллидж");
  });

  it("falls back to the deprecated name columns", async () => {
    // Project predates the four-locale migration, so a project with no
    // Translation rows at all still has a name — and dropping to "" here
    // would blank the eyebrow on every card.
    brochureFindMany.mockResolvedValue([withProject([])]);

    const [brochure] = await getPublishedBrochures("th");

    expect(brochure.projectName).toBe("ทรินิตี้ วิลเลจ");
  });

  it("is null for a brochure that belongs to no project", async () => {
    brochureFindMany.mockResolvedValue([row()]);

    const [brochure] = await getPublishedBrochures("en");

    expect(brochure.projectName).toBeNull();
  });
});

describe("getBrochureBySlug", () => {
  it("returns the file URL and the project slug", async () => {
    brochureFindFirst.mockResolvedValue(
      row({
        project: {
          slug: "trinity-village",
          nameEn: "Trinity Village",
          nameTh: "ทรินิตี้",
          translations: [],
        },
      }),
    );

    const brochure = await getBrochureBySlug("trinity-village", "en");

    expect(brochure?.fileUrl).toBe("https://cdn.example.com/brochures/trinity/abc.pdf");
    expect(brochure?.projectSlug).toBe("trinity-village");
  });

  it("only ever asks for a published row", async () => {
    // The guard that keeps a draft brochure off a guessable URL.
    brochureFindFirst.mockResolvedValue(null);

    await getBrochureBySlug("draft-thing", "en");

    expect(brochureFindFirst.mock.calls[0][0].where).toEqual({
      slug: "draft-thing",
      isPublished: true,
    });
  });

  it("returns null for an unknown slug", async () => {
    brochureFindFirst.mockResolvedValue(null);

    await expect(getBrochureBySlug("nope", "en")).resolves.toBeNull();
  });

  it("returns null rather than throwing when the database is unreachable", async () => {
    // The page turns null into a 404 — but only after checking
    // isDatabaseOffline(), so an outage is not cached as one.
    brochureFindFirst.mockRejectedValue(offline());

    await expect(getBrochureBySlug("trinity-village", "en")).resolves.toBeNull();
  });
});

describe("getPublishedBrochureSlugs", () => {
  it("returns bare slugs for generateStaticParams", async () => {
    brochureFindMany.mockResolvedValue([{ slug: "a" }, { slug: "b" }]);

    await expect(getPublishedBrochureSlugs()).resolves.toEqual(["a", "b"]);
  });

  it("degrades to an empty list, so a build survives an outage", async () => {
    brochureFindMany.mockRejectedValue(offline());

    await expect(getPublishedBrochureSlugs()).resolves.toEqual([]);
  });
});

describe("getBrochureSitemapEntries", () => {
  it("returns slugs with their last-modified dates", async () => {
    const updatedAt = new Date("2026-09-02T00:00:00.000Z");
    brochureFindMany.mockResolvedValue([{ slug: "a", updatedAt }]);

    await expect(getBrochureSitemapEntries()).resolves.toEqual([{ slug: "a", updatedAt }]);
  });

  it("degrades to an empty list rather than failing the whole sitemap", async () => {
    brochureFindMany.mockRejectedValue(offline());

    await expect(getBrochureSitemapEntries()).resolves.toEqual([]);
  });
});
