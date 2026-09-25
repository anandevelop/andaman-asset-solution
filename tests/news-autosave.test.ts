/**
 * tests/news-autosave.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * autosaveArticleDraft() — §7.1's server half.
 *
 * What is asserted here is mostly what the action must *not* do. §7.1
 * states it as a prohibition ("must not touch the article's status or
 * publishedAt"), and the failure it guards against is invisible: an
 * autosave that quietly writes to the article would republish a draft, or
 * move a published article's date, on a timer, with nobody having pressed
 * anything. Mocking Prisma is the only way to see which tables a call
 * reaches.
 *
 * The other guarantee is that autosaves replace each other rather than
 * accumulating — one row per article, not one per minute of typing.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

const { requireAdminAction } = vi.hoisted(() => ({ requireAdminAction: vi.fn() }));
vi.mock("@/lib/admin/guard", () => ({ requireAdminAction }));

const prismaMock = vi.hoisted(() => ({
  newsArticle: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
  },
  contentRevision: { create: vi.fn(), deleteMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Imported for its side effects by the actions module; none of it runs here.
vi.mock("@/app/[locale]/admin/(content)/publishing/actions", () => ({
  submitForReview: vi.fn(),
  approveAndPublish: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { autosaveArticleDraft } = await import("@/app/[locale]/admin/(content)/news/actions");

const FIELDS = {
  title: "A title",
  content: "<p>Body.</p>",
  metaTitle: "",
  metaDescription: "",
  focusKeyword: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAction.mockResolvedValue({ id: "user-1", role: Role.EDITOR });
  prismaMock.newsArticle.findFirst.mockResolvedValue({ id: "a1", contentFormat: "HTML" });
  prismaMock.$transaction.mockResolvedValue([]);
});

describe("autosaveArticleDraft", () => {
  it("checks the role before anything else, like every other action here", async () => {
    await autosaveArticleDraft("a1", "en", FIELDS);
    expect(requireAdminAction).toHaveBeenCalledWith(Role.EDITOR);
  });

  it("refuses when the guard refuses", async () => {
    requireAdminAction.mockRejectedValue(new Error("UNAUTHORISED"));
    await expect(autosaveArticleDraft("a1", "en", FIELDS)).rejects.toThrow("UNAUTHORISED");
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("never writes to the article, so status and publishedAt cannot move", async () => {
    await autosaveArticleDraft("a1", "en", FIELDS);
    expect(prismaMock.newsArticle.update).not.toHaveBeenCalled();
    expect(prismaMock.newsArticle.updateMany).not.toHaveBeenCalled();
  });

  it("replaces the previous autosave instead of adding another row", async () => {
    await autosaveArticleDraft("a1", "en", FIELDS);

    expect(prismaMock.contentRevision.deleteMany).toHaveBeenCalledWith({
      where: { contentType: "NEWS_ARTICLE", contentId: "a1", source: "autosave" },
    });
    expect(prismaMock.contentRevision.create).toHaveBeenCalledTimes(1);
    // Both in one transaction: a delete that lands without its replacement
    // would throw away the only copy of someone's unsaved work.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
  });

  it("only ever deletes its own rows, never a human-made revision", async () => {
    await autosaveArticleDraft("a1", "en", FIELDS);
    const where = prismaMock.contentRevision.deleteMany.mock.calls[0][0].where;
    expect(where.source).toBe("autosave");
    expect(where.contentId).toBe("a1");
  });

  it("stores the body sanitized, because a draft is still client-supplied HTML", async () => {
    await autosaveArticleDraft("a1", "en", {
      ...FIELDS,
      content: '<p>ok</p><script>alert(1)</script>',
    });

    const snapshot = prismaMock.contentRevision.create.mock.calls[0][0].data.snapshot as {
      translations: { content: string }[];
    };
    expect(snapshot.translations[0].content).not.toContain("<script");
    expect(snapshot.translations[0].content).toContain("ok");
  });

  it("writes the snapshot in the shape a revert already reads", async () => {
    await autosaveArticleDraft("a1", "th", FIELDS);
    const data = prismaMock.contentRevision.create.mock.calls[0][0].data;
    expect(data.contentType).toBe("NEWS_ARTICLE");
    expect(data.source).toBe("autosave");
    expect(data.createdById).toBe("user-1");
    expect((data.snapshot as { translations: { locale: string }[] }).translations[0].locale).toBe("th");
  });

  it("refuses a locale the site does not have", async () => {
    expect(await autosaveArticleDraft("a1", "xx", FIELDS)).toEqual({ ok: false });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("refuses an article that is gone", async () => {
    prismaMock.newsArticle.findFirst.mockResolvedValue(null);
    expect(await autosaveArticleDraft("a1", "en", FIELDS)).toEqual({ ok: false });
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});
