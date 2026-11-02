/**
 * tests/lead-delete.test.ts
 *
 * deleteLeads: ADMIN and above only, logged before it happens and without
 * the customer's name, refused for a lead that holds a unit, and the bell's
 * notifications about the lead go with it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const audit: Array<Record<string, unknown>> = [];
const deletedLeads: string[] = [];
const deletedNotifications: string[] = [];
let role = "ADMIN";
let auditFails = false;

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/admin/guard", () => ({
  requireAdminAction: async (minimum: string) => {
    const rank = ["VIEWER", "SALES", "EDITOR", "ADMIN", "SUPER_ADMIN"];
    if (rank.indexOf(role) < rank.indexOf(minimum)) throw new Error("UNAUTHORISED");
    return { id: "u1", email: "admin@example.com", role, name: "a", twoFactorPending: false };
  },
  requireCapabilityAction: async () => ({ id: "u1", email: "admin@example.com", role }),
}));
vi.mock("@/lib/audit/events", () => ({
  LEAD_ERASE_REASONS: ["test", "duplicate", "spam", "pdpaRequest", "other"],
  recordContactReveal: async () => {},
  recordLeadErasure: async (entry: Record<string, unknown>) => {
    if (auditFails) throw new Error("audit down");
    audit.push(entry);
  },
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    leadInquiry: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in
          .filter((id) => id !== "missing")
          .map((id) => ({ id, _count: { reservedUnits: id === "buyer" ? 1 : 0 } })),
      delete: ({ where }: { where: { id: string } }) => ({ kind: "lead", id: where.id }),
    },
    adminNotification: {
      deleteMany: ({ where }: { where: { href: { contains: string } } }) => ({ kind: "note", id: where.href.contains }),
    },
    $transaction: async (ops: Array<{ kind: string; id: string }>) => {
      for (const op of ops) (op.kind === "lead" ? deletedLeads : deletedNotifications).push(op.id);
    },
  },
}));

import { deleteLeads } from "@/app/[locale]/admin/(crm)/leads/actions";

beforeEach(() => {
  audit.length = 0;
  deletedLeads.length = 0;
  deletedNotifications.length = 0;
  role = "ADMIN";
  auditFails = false;
});

describe("deleteLeads", () => {
  it("refuses anyone below ADMIN", async () => {
    role = "SALES";
    expect(await deleteLeads("th", { ids: ["l1"], reason: "test" })).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(deletedLeads).toEqual([]);
  });

  it("needs a known reason", async () => {
    expect(await deleteLeads("th", { ids: ["l1"], reason: "because" })).toEqual({ ok: false, error: "INVALID_INPUT" });
  });

  it("logs the reason without a name, then deletes the lead and its notifications", async () => {
    const result = await deleteLeads("th", { ids: ["l1", "l2"], reason: "pdpaRequest" });
    expect(result).toEqual({ ok: true, deleted: ["l1", "l2"], refused: [] });
    expect(deletedLeads).toEqual(["l1", "l2"]);
    expect(deletedNotifications).toEqual(["l1", "l2"]);
    expect(audit).toEqual([
      expect.objectContaining({ leadId: "l1", reason: "pdpaRequest" }),
      expect.objectContaining({ leadId: "l2", reason: "pdpaRequest" }),
    ]);
    expect(audit.every((entry) => !("leadName" in entry))).toBe(true);
  });

  it("keeps a lead that holds a unit, and says why", async () => {
    const result = await deleteLeads("th", { ids: ["buyer", "l3", "missing"], reason: "test" });
    expect(result).toEqual({
      ok: true,
      deleted: ["l3"],
      refused: [
        { id: "buyer", reason: "UNITS" },
        { id: "missing", reason: "NOT_FOUND" },
      ],
    });
  });

  it("keeps the lead when the deletion cannot be logged", async () => {
    auditFails = true;
    const result = await deleteLeads("th", { ids: ["l1"], reason: "spam" });
    expect(result).toEqual({ ok: true, deleted: [], refused: [{ id: "l1", reason: "FAILED" }] });
    expect(deletedLeads).toEqual([]);
  });
});
