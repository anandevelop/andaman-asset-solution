/**
 * tests/audit-2026-11-11.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Regression tests for the 2026-11-11 audit fixes (see the project doc
 * claude/audit-2026-11-11-system-bugs.md). One describe per finding.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

const prismaMock = vi.hoisted(() => ({
  project: { findMany: vi.fn() },
  projectUnit: { findMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn() },
  newsArticle: { findMany: vi.fn() },
  event: { findMany: vi.fn() },
  media: { findMany: vi.fn() },
  leadInquiry: { findMany: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
  siteSetting: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

let session: { id: string; role: Role } = { id: "u1", role: Role.EDITOR };
vi.mock("@/lib/admin/guard", () => ({
  requireAdminAction: async () => session,
  requireCapabilityAction: async () => session,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn(), updateTag: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of Object.values(prismaMock)) {
    for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  }
  prismaMock.user.findUnique.mockResolvedValue({ scopedProjects: [] });
});

describe("⌘K lead search", () => {
  it("returns no leads to an EDITOR (outranks SALES, but may not read leads)", async () => {
    session = { id: "e1", role: Role.EDITOR };
    const { commandSearch } = await import("@/app/[locale]/admin/command-search-actions");
    await commandSearch("en", "0812");
    expect(prismaMock.leadInquiry.findMany).not.toHaveBeenCalled();
  });

  it("lets SALES match on name only, inside its pool, and masks the phone", async () => {
    session = { id: "s1", role: Role.SALES };
    prismaMock.leadInquiry.findMany.mockResolvedValue([
      { id: "l1", name: "Somchai", phone: "+66812345678", status: "NEW" },
    ]);
    const { commandSearch } = await import("@/app/[locale]/admin/command-search-actions");
    const result = await commandSearch("en", "Som");

    const [{ where }] = prismaMock.leadInquiry.findMany.mock.calls[0];
    expect(where.AND[0]).toEqual({ name: { contains: "Som", mode: "insensitive" } });
    expect(JSON.stringify(where.AND[1])).toContain("s1");

    const hit = result.groups.find((g) => g.key === "leads")!.hits[0];
    expect(hit.subtitle).not.toContain("12345678");
  });

  it("applies an ADMIN's project scope", async () => {
    session = { id: "a1", role: Role.ADMIN };
    prismaMock.user.findUnique.mockResolvedValue({ scopedProjects: [{ id: "p1" }] });
    const { commandSearch } = await import("@/app/[locale]/admin/command-search-actions");
    await commandSearch("en", "Som");
    const [{ where }] = prismaMock.leadInquiry.findMany.mock.calls[0];
    expect(where.AND[1]).toEqual({ projectId: { in: ["p1"] } });
  });
});

describe("lead routing and project scope", () => {
  beforeEach(() => {
    prismaMock.siteSetting.findUnique.mockResolvedValue({ value: JSON.stringify({ enabled: true }) });
  });

  it("only considers reps who can see the lead's project", async () => {
    const { decideAssignee } = await import("@/lib/lead-routing");
    await decideAssignee({ commsLanguage: "th", projectId: "p9" });
    const [{ where }] = prismaMock.user.findMany.mock.calls[0];
    expect(where.OR).toEqual([{ scopedProjects: { none: {} } }, { scopedProjects: { some: { id: "p9" } } }]);
  });

  it("gives a lead with no project only to unscoped reps", async () => {
    const { decideAssignee } = await import("@/lib/lead-routing");
    await decideAssignee({ commsLanguage: "th", projectId: null });
    const [{ where }] = prismaMock.user.findMany.mock.calls[0];
    expect(where.OR).toEqual([{ scopedProjects: { none: {} } }]);
  });
});

describe("unit holds", () => {
  it("won't let a SALES rep change a unit another rep holds", async () => {
    session = { id: "s1", role: Role.SALES };
    prismaMock.projectUnit.updateMany.mockResolvedValue({ count: 0 });
    const { setUnitStatus } = await import("@/app/[locale]/admin/(catalog)/projects/[id]/units/actions");
    const result = await setUnitStatus("en", "p1", "slug", "u1", "AVAILABLE");
    expect(result.ok).toBe(false);
    const [{ where }] = prismaMock.projectUnit.updateMany.mock.calls[0];
    expect(where.OR).toEqual([{ reservedById: null }, { reservedById: "s1" }]);
  });

  it("leaves ADMIN unrestricted", async () => {
    session = { id: "a1", role: Role.ADMIN };
    prismaMock.projectUnit.updateMany.mockResolvedValue({ count: 1 });
    const { setUnitStatus } = await import("@/app/[locale]/admin/(catalog)/projects/[id]/units/actions");
    await setUnitStatus("en", "p1", "slug", "u1", "AVAILABLE");
    const [{ where }] = prismaMock.projectUnit.updateMany.mock.calls[0];
    expect(where.OR).toBeUndefined();
  });
});

describe("bangkokToday", () => {
  it("starts at Bangkok midnight, not UTC midnight", async () => {
    const { bangkokToday } = await import("@/lib/admin/month-grid");
    // 06:30 on 12 Nov in Bangkok is 23:30 on 11 Nov UTC.
    const { start, end } = bangkokToday(new Date("2026-11-11T23:30:00Z"));
    expect(start.toISOString()).toBe("2026-11-11T17:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-12T17:00:00.000Z");
  });
});
