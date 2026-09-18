/**
 * tests/lib/admin/link-graph.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * runWithLimit() — the hand-rolled concurrency limiter behind
 * checkExternalLinkStatuses() — and that function's own cache behavior.
 * Prisma mocked and global fetch stubbed, per this codebase's convention
 * that DB- and network-touching orchestration isn't exercised for real in
 * a unit test (see tests/lib/keywords/rank-updates.test.ts for the same
 * Prisma-mocking shape).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { findMany, updateMany, createMany, deleteMany, transaction, newsArticleFindMany, emptyFindMany } = vi.hoisted(
  () => ({
    findMany: vi.fn(),
    updateMany: vi.fn(),
    createMany: vi.fn(),
    deleteMany: vi.fn(),
    transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    newsArticleFindMany: vi.fn().mockResolvedValue([]),
    emptyFindMany: vi.fn().mockResolvedValue([]),
  }),
);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    contentLink: { findMany, updateMany, createMany, deleteMany },
    newsArticle: { findMany: newsArticleFindMany },
    project: { findMany: emptyFindMany },
    event: { findMany: emptyFindMany },
    faq: { findMany: emptyFindMany },
    heroStorySlide: { findMany: emptyFindMany },
    $transaction: transaction,
  },
}));

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  updateMany.mockReset().mockResolvedValue({ count: 0 });
  createMany.mockReset().mockResolvedValue({ count: 0 });
  deleteMany.mockReset().mockResolvedValue({ count: 0 });
  newsArticleFindMany.mockReset().mockResolvedValue([]);
  emptyFindMany.mockClear();
  transaction.mockClear();
  vi.unstubAllGlobals();
});

describe("runWithLimit", () => {
  it("never runs more than `limit` workers concurrently", async () => {
    const { runWithLimit } = await import("@/lib/admin/link-graph");
    let active = 0;
    let maxActive = 0;

    await runWithLimit([1, 2, 3, 4, 5, 6], 2, async (item) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return item * 2;
    });

    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("returns results indexed to the input order, regardless of completion order", async () => {
    const { runWithLimit } = await import("@/lib/admin/link-graph");
    const delays = [30, 10, 20];

    const results = await runWithLimit(delays, 3, async (delay) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return delay;
    });

    expect(results).toEqual([30, 10, 20]);
  });

  it("propagates a single rejection rather than swallowing it", async () => {
    const { runWithLimit } = await import("@/lib/admin/link-graph");

    await expect(
      runWithLimit([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error("boom");
        return item;
      }),
    ).rejects.toThrow("boom");
  });

  it("handles an empty input list", async () => {
    const { runWithLimit } = await import("@/lib/admin/link-graph");
    expect(await runWithLimit([] as number[], 5, async (x: number) => x)).toEqual([]);
  });
});

describe("checkExternalLinkStatuses", () => {
  it("caches a definite status so the same URL is not re-fetched within the TTL", async () => {
    findMany.mockResolvedValue([{ toPath: "https://example.com/cached-ok" }]);
    const fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    const { checkExternalLinkStatuses } = await import("@/lib/admin/link-graph");
    await checkExternalLinkStatuses();
    await checkExternalLinkStatuses();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache a network failure, so the same URL is retried next time", async () => {
    findMany.mockResolvedValue([{ toPath: "https://example.com/flaky" }]);
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    const { checkExternalLinkStatuses } = await import("@/lib/admin/link-graph");
    await checkExternalLinkStatuses();
    const result = await checkExternalLinkStatuses();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.rowsUpdated).toBe(1);
  });

  it("retries once with GET when HEAD comes back 405", async () => {
    findMany.mockResolvedValue([{ toPath: "https://example.com/head-rejected" }]);
    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, init: { method: string }) =>
        Promise.resolve({ status: init.method === "HEAD" ? 405 : 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { checkExternalLinkStatuses } = await import("@/lib/admin/link-graph");
    const result = await checkExternalLinkStatuses();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.rowsUpdated).toBe(1);
  });

  it("writes httpStatus back onto every ContentLink row sharing that URL", async () => {
    findMany.mockResolvedValue([{ toPath: "https://example.com/broken" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 404 }));

    const { checkExternalLinkStatuses } = await import("@/lib/admin/link-graph");
    await checkExternalLinkStatuses();

    expect(updateMany).toHaveBeenCalledWith({
      where: { isInternal: false, toPath: "https://example.com/broken" },
      data: { httpStatus: 404, checkedAt: expect.any(Date) },
    });
  });
});

describe("scanAndPersistLinkGraph — external status carry-forward", () => {
  it("keeps a previously-checked external link's httpStatus/checkedAt across a rescan", async () => {
    const oldCheckedAt = new Date("2026-01-01T00:00:00.000Z");

    newsArticleFindMany.mockResolvedValue([
      {
        id: "article-1",
        translations: [{ locale: "en", content: "See our [partner](https://example.com/partner) page." }],
      },
    ]);
    // The "previous external statuses" lookup — a prior check found this
    // link broken. A fresh scan re-discovers the same link (same fromType/
    // fromId/fromLocale/toPath) and must not reset it back to unchecked.
    findMany.mockResolvedValue([
      {
        fromType: "NEWS_ARTICLE",
        fromId: "article-1",
        fromLocale: "en",
        toPath: "https://example.com/partner",
        httpStatus: 404,
        checkedAt: oldCheckedAt,
      },
    ]);

    const { scanAndPersistLinkGraph } = await import("@/lib/admin/link-graph");
    await scanAndPersistLinkGraph();

    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          fromType: "NEWS_ARTICLE",
          fromId: "article-1",
          toPath: "https://example.com/partner",
          isInternal: false,
          httpStatus: 404,
          checkedAt: oldCheckedAt,
        }),
      ],
    });
  });

  it("leaves a brand-new external link unchecked (null httpStatus)", async () => {
    newsArticleFindMany.mockResolvedValue([
      { id: "article-2", translations: [{ locale: "en", content: "See our [new partner](https://example.com/new) page." }] },
    ]);
    findMany.mockResolvedValue([]); // no previous external statuses recorded anywhere

    const { scanAndPersistLinkGraph } = await import("@/lib/admin/link-graph");
    await scanAndPersistLinkGraph();

    expect(createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ toPath: "https://example.com/new", httpStatus: null })],
    });
  });
});
