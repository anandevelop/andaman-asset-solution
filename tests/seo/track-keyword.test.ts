/**
 * tests/seo/track-keyword.test.ts
 * "Track" on a Search Console query really adds it to the keyword library,
 * once.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ keyword: { findFirst: vi.fn(), create: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/admin/guard", () => ({ requireAdminAction: async () => ({ id: "a1", role: "ADMIN" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));

import { trackSearchQuery } from "@/app/[locale]/admin/(growth)/seo/keywords/actions";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.keyword.findFirst.mockResolvedValue(null);
  prismaMock.keyword.create.mockResolvedValue({ id: "k1" });
});

describe("trackSearchQuery", () => {
  it("saves the phrase, tidied", async () => {
    await expect(trackSearchQuery("en", "  pool   villa phuket ")).resolves.toEqual({ ok: true });
    expect(prismaMock.keyword.create.mock.calls[0][0].data).toMatchObject({ phrase: "pool villa phuket" });
  });

  it("does not save a phrase the library already has, in any letter case", async () => {
    prismaMock.keyword.findFirst.mockResolvedValue({ id: "k1" });
    await expect(trackSearchQuery("en", "Pool Villa Phuket")).resolves.toEqual({ ok: true });
    expect(prismaMock.keyword.create).not.toHaveBeenCalled();
  });

  it("refuses an empty phrase", async () => {
    await expect(trackSearchQuery("en", "   ")).resolves.toEqual({ ok: false, error: "EMPTY" });
  });
});
