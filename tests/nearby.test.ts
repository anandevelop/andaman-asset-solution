/**
 * tests/nearby.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Which Nearby list a project page shows (lib/nearby.ts): its own, else
 * the shared one, else the built-in list. The last step is what keeps a
 * fresh database from rendering an empty panel, so it gets a case of its
 * own, and so does the label fallback to English.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ prisma: { nearbyCategory: { findMany } } }));
vi.mock("@/lib/db", () => ({ safeQuery: (_name: string, fn: () => unknown) => fn() }));

const { getNearbyForProject, getNearbyForEditing } = await import("@/lib/nearby");
const { NEARBY_DEFAULTS } = await import("@/content/nearby-attractions");

const row = (projectId: string | null, labelEn: string, labelTh = "") => ({
  id: `${projectId ?? "shared"}-${labelEn}`,
  projectId,
  labelEn,
  labelTh,
  labelZh: "",
  labelRu: "",
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  places: [{ id: "p1", name: "Some School", distanceKm: "3.50", durationMin: 6, sortOrder: 0 }],
});

function store(rows: ReturnType<typeof row>[]) {
  findMany.mockImplementation(async ({ where }: { where: { projectId: string | null } }) =>
    rows.filter((r) => r.projectId === where.projectId),
  );
}

// Braces matter: mockReset() returns the mock, and a function returned from
// a hook is run as its teardown, with no arguments.
beforeEach(() => {
  findMany.mockReset();
});

describe("getNearbyForProject", () => {
  it("shows the project's own list when it has one", async () => {
    store([row("p-1", "Schools", "โรงเรียน"), row(null, "Shared")]);
    const list = await getNearbyForProject("p-1", "th");
    expect(list.map((c) => c.categoryName)).toEqual(["โรงเรียน"]);
    expect(list[0].items[0]).toMatchObject({ name: "Some School", distanceKm: 3.5, durationMin: 6 });
  });

  it("falls back to the shared list", async () => {
    store([row(null, "Shared")]);
    const list = await getNearbyForProject("p-2", "en");
    expect(list.map((c) => c.categoryName)).toEqual(["Shared"]);
  });

  it("falls back to the built-in list on an empty database", async () => {
    store([]);
    const list = await getNearbyForProject("p-3", "en");
    expect(list).toHaveLength(NEARBY_DEFAULTS.length);
    expect(list[0].categoryName).toBe(NEARBY_DEFAULTS[0].categoryName.en);
  });

  it("uses the English label when the locale's is blank", async () => {
    store([row("p-1", "Beach", "")]);
    const list = await getNearbyForProject("p-1", "th");
    expect(list[0].categoryName).toBe("Beach");
  });
});

describe("getNearbyForEditing", () => {
  it("says where the list came from", async () => {
    store([row(null, "Shared")]);
    expect((await getNearbyForEditing("p-9")).source).toBe("shared");
    store([row("p-9", "Own")]);
    expect((await getNearbyForEditing("p-9")).source).toBe("project");
    store([]);
    expect((await getNearbyForEditing(null)).source).toBe("builtIn");
  });
});
