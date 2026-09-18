/**
 * tests/audit-seo-override.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * recordSeoOverride() is the third AuditLog writer (lib/audit/events.ts's
 * header) — these tests check its write shape and that a write failure
 * never throws, the same two guarantees tests/audit-auth-events.test.ts
 * already holds recordAuthEvent to.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recordSeoOverride, SEO_PUBLISH_OVERRIDE } from "@/lib/audit/events";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { auditLog: { create } },
}));

const ACTOR = { id: "admin-1", email: "admin@andaman.test", role: "ADMIN" as const };

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "entry-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordSeoOverride", () => {
  it("writes an entry naming the article, the actor, and the score at override time", async () => {
    await recordSeoOverride({
      actor: ACTOR,
      articleId: "article-1",
      articleSlug: "beachfront-villas",
      seoScore: 41,
      failingChecks: [{ id: "bodyLength", weight: 3 }],
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].data).toMatchObject({
      actorId: ACTOR.id,
      actorEmail: ACTOR.email,
      actorRole: ACTOR.role,
      action: SEO_PUBLISH_OVERRIDE,
      model: "NewsArticle",
      recordId: "article-1",
      recordLabel: "beachfront-villas",
      changedFields: ["isPublished"],
      changes: { override: { seoScore: 41, failingChecks: [{ id: "bodyLength", weight: 3 }] } },
    });
  });

  it("bounds actorEmail the same way recordAuthEvent does", async () => {
    const long = `${"a".repeat(500)}@example.com`;
    await recordSeoOverride({
      actor: { ...ACTOR, email: long },
      articleId: "article-1",
      articleSlug: "x",
      seoScore: 0,
      failingChecks: [],
    });

    expect(create.mock.calls[0][0].data.actorEmail.length).toBe(200);
  });

  it("never throws when the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValueOnce(new Error("database is down"));

    await expect(
      recordSeoOverride({
        actor: ACTOR,
        articleId: "article-1",
        articleSlug: "x",
        seoScore: 0,
        failingChecks: [],
      }),
    ).resolves.toBeUndefined();
  });
});
