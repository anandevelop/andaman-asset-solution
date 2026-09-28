/**
 * tests/unit-type-floors-save.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * saveUnitTypeFloors — the diff, not the arithmetic.
 *
 * The guarantee under test is that editing a unit type does not churn its
 * row ids. A wipe-and-recreate would pass any assertion about the *values*
 * afterwards while quietly detaching every room from whatever referenced
 * it, and turning a one-word rename into "deleted 13 rooms, created 13
 * rooms" in the audit trail. Only watching which Prisma calls were made
 * catches that, which is why this mocks the client — the same reasoning as
 * tests/news-autosave.test.ts.
 *
 * The other thing worth pinning is that deriving a blueprint is skipped for
 * a floor whose drawing did not change. It is a download, a decode and an
 * upload; doing it because somebody corrected a lift label would make every
 * save slow for no result.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

const { requireAdminAction } = vi.hoisted(() => ({ requireAdminAction: vi.fn() }));
vi.mock("@/lib/admin/guard", () => ({ requireAdminAction }));

const { deriveBlueprint } = vi.hoisted(() => ({ deriveBlueprint: vi.fn() }));
vi.mock("@/lib/floor-plan-images", () => ({ deriveBlueprint }));

const prismaMock = vi.hoisted(() => {
  const floorPlan = {
    findMany: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  };
  const floorPlanRoom = { update: vi.fn(), create: vi.fn(), deleteMany: vi.fn() };
  const floorPlanRoomTranslation = { upsert: vi.fn(), deleteMany: vi.fn() };

  return {
    projectUnitType: { findFirst: vi.fn() },
    floorPlan,
    floorPlanRoom,
    floorPlanRoomTranslation,
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ floorPlan, floorPlanRoom, floorPlanRoomTranslation }),
    ),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { saveUnitTypeFloors } = await import(
  "@/app/[locale]/admin/(catalog)/projects/[id]/unit-types/actions"
);

const ROOM = {
  id: "room-1",
  names: { en: "Living Room", th: "ห้องนั่งเล่น" },
  areaSqm: 30,
  xPercent: 40,
  yPercent: 60,
  photoUrl: "/gallery/x.webp",
  sortOrder: 0,
};

const FLOOR = {
  id: "floor-1",
  floorName: "1st Floor",
  shortLabel: "1",
  areaSqm: 196.1,
  imageUrl: "/floor-plans/victory/unit-types/vA1-line.webp",
  furnishedImageUrl: null,
  portraitRotation: "CW" as const,
  rooms: [ROOM],
  sortOrder: 0,
};

const save = (floors: unknown[]) =>
  saveUnitTypeFloors("en", "project-1", "victory", "type-1", { floors } as never);

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAction.mockResolvedValue({ id: "admin-1", role: Role.EDITOR });
  prismaMock.projectUnitType.findFirst.mockResolvedValue({ id: "type-1" });
  prismaMock.floorPlan.findMany.mockResolvedValue([
    { id: "floor-1", imageUrl: FLOOR.imageUrl },
  ]);
  prismaMock.floorPlan.update.mockImplementation(async ({ where }: never) => ({ id: where.id }));
  prismaMock.floorPlan.create.mockResolvedValue({ id: "floor-new" });
  prismaMock.floorPlanRoom.update.mockImplementation(async ({ where }: never) => ({
    id: where.id,
  }));
  prismaMock.floorPlanRoom.create.mockResolvedValue({ id: "room-new" });
  deriveBlueprint.mockResolvedValue({ blueprintUrl: "/bp.webp", width: 1800, height: 700 });
});

describe("the id-preserving diff", () => {
  it("updates an existing floor in place instead of recreating it", async () => {
    const result = await save([FLOOR]);

    expect(result.ok).toBe(true);
    expect(prismaMock.floorPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "floor-1" } }),
    );
    expect(prismaMock.floorPlan.create).not.toHaveBeenCalled();
  });

  it("updates an existing room in place", async () => {
    await save([FLOOR]);

    expect(prismaMock.floorPlanRoom.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "room-1" } }),
    );
    expect(prismaMock.floorPlanRoom.create).not.toHaveBeenCalled();
  });

  it("creates a pin the admin just placed, which has no id yet", async () => {
    await save([{ ...FLOOR, rooms: [ROOM, { ...ROOM, id: undefined, sortOrder: 1 }] }]);

    expect(prismaMock.floorPlanRoom.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.floorPlanRoom.update).toHaveBeenCalledTimes(1);
  });

  it("deletes only the rooms the draft no longer contains", async () => {
    await save([FLOOR]);

    expect(prismaMock.floorPlanRoom.deleteMany).toHaveBeenCalledWith({
      where: { floorPlanId: "floor-1", id: { notIn: ["room-1"] } },
    });
  });

  it("deletes only the floors the draft no longer contains", async () => {
    await save([FLOOR]);

    expect(prismaMock.floorPlan.deleteMany).toHaveBeenCalledWith({
      where: { unitTypeId: "type-1", id: { notIn: ["floor-1"] } },
    });
  });

  it("renumbers sortOrder from the draft's order, not the submitted value", async () => {
    // The admin dragged the second floor to the top; its stored sortOrder
    // is stale until this runs.
    await save([
      { ...FLOOR, id: "floor-2", shortLabel: "2", sortOrder: 7 },
      { ...FLOOR, sortOrder: 3 },
    ]);

    const orders = prismaMock.floorPlan.update.mock.calls.map(
      ([args]: never) => args.data.sortOrder,
    );
    expect(orders).toEqual([0, 1]);
  });
});

describe("blueprint derivation", () => {
  it("is skipped when the drawing has not changed", async () => {
    await save([FLOOR]);
    expect(deriveBlueprint).not.toHaveBeenCalled();
  });

  it("runs when the drawing is replaced", async () => {
    await save([{ ...FLOOR, imageUrl: "/floor-plans/new-line.webp" }]);

    expect(deriveBlueprint).toHaveBeenCalledWith("/floor-plans/new-line.webp");
    expect(prismaMock.floorPlan.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          blueprintImageUrl: "/bp.webp",
          imageWidth: 1800,
          imageHeight: 700,
        }),
      }),
    );
  });

  it("runs for a floor that is brand new", async () => {
    await save([FLOOR, { ...FLOOR, id: undefined, shortLabel: "2" }]);
    expect(deriveBlueprint).toHaveBeenCalledTimes(1);
  });

  it("leaves the existing blueprint alone when nothing was derived", async () => {
    await save([FLOOR]);

    const [{ data }] = prismaMock.floorPlan.update.mock.calls[0] as never;
    expect(data).not.toHaveProperty("blueprintImageUrl");
  });

  it("still saves when deriving throws", async () => {
    deriveBlueprint.mockRejectedValue(new Error("Spaces is down"));

    const result = await save([{ ...FLOOR, imageUrl: "/floor-plans/new-line.webp" }]);

    expect(result.ok).toBe(true);
    expect(prismaMock.floorPlan.update).toHaveBeenCalled();
  });
});

describe("room names", () => {
  it("upserts a language the admin filled in", async () => {
    await save([FLOOR]);

    expect(prismaMock.floorPlanRoomTranslation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roomId_locale: { roomId: "room-1", locale: "en" } },
        update: { name: "Living Room" },
      }),
    );
  });

  it("removes a language the admin cleared, rather than storing an empty name", async () => {
    // zh and ru were never filled in; they must not become blank rows, or
    // getTranslation would find one and render nothing.
    await save([FLOOR]);

    expect(prismaMock.floorPlanRoomTranslation.deleteMany).toHaveBeenCalledWith({
      where: { roomId: "room-1", locale: "zh" },
    });
  });
});

describe("refusals", () => {
  it("requires EDITOR", async () => {
    requireAdminAction.mockRejectedValue(new Error("UNAUTHORISED"));

    await expect(save([FLOOR])).rejects.toThrow("UNAUTHORISED");
    expect(requireAdminAction).toHaveBeenCalledWith(Role.EDITOR);
  });

  it("refuses a unit type that belongs to another project", async () => {
    prismaMock.projectUnitType.findFirst.mockResolvedValue(null);

    const result = await save([FLOOR]);

    expect(result).toEqual({ ok: false, message: "NOT_FOUND" });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses two floors sharing a lift label", async () => {
    const result = await save([FLOOR, { ...FLOOR, id: "floor-2" }]);

    expect(result.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a room with no name in any language", async () => {
    const result = await save([{ ...FLOOR, rooms: [{ ...ROOM, names: { en: "  " } }] }]);

    expect(result.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses a pin outside the drawing", async () => {
    const result = await save([{ ...FLOOR, rooms: [{ ...ROOM, xPercent: 140 }] }]);

    expect(result.ok).toBe(false);
  });

  it("refuses a type with no floors at all", async () => {
    const result = await save([]);

    expect(result.ok).toBe(false);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
