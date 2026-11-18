import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteMany = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { auditLog: { deleteMany: (a: unknown) => deleteMany(a) } } }));
vi.mock("@/lib/audit/events", () => ({ AUTH_MODEL: "Session", CONTACT_REVEAL: "reveal_contact", LEAD_ERASE: "erase_lead" }));

import { AUDIT_RETENTION_DAYS, auditPruneFilters, pruneAuditLog } from "@/lib/audit/retention";

const now = new Date("2026-11-18T00:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

/** Which window an entry falls into, by the same clauses the job deletes with. */
function windowOf(entry: { model: string; action: string }) {
  const f = auditPruneFilters(now);
  if (entry.model === (f.signIns.model as string)) return "signIns";
  if (((f.customerData.action as { in: string[] }).in).includes(entry.action)) return "customerData";
  return "edits";
}

beforeEach(() => {
  deleteMany.mockReset();
  deleteMany.mockResolvedValue({ count: 0 });
});

describe("audit retention", () => {
  it("keeps sign-ins 90 days, edits 30 days, customer-data events three years", () => {
    expect(AUDIT_RETENTION_DAYS).toEqual({ signIns: 90, edits: 30, customerData: 1095 });

    const f = auditPruneFilters(now);
    expect((f.signIns.createdAt as { lt: Date }).lt).toEqual(daysAgo(90));
    expect((f.edits.createdAt as { lt: Date }).lt).toEqual(daysAgo(30));
    expect((f.customerData.createdAt as { lt: Date }).lt).toEqual(daysAgo(1095));
  });

  it("puts every entry in exactly one window", () => {
    expect(windowOf({ model: "Session", action: "login" })).toBe("signIns");
    expect(windowOf({ model: "Session", action: "login_failed" })).toBe("signIns");
    expect(windowOf({ model: "LeadInquiry", action: "reveal_contact" })).toBe("customerData");
    expect(windowOf({ model: "LeadInquiry", action: "erase_lead" })).toBe("customerData");
    expect(windowOf({ model: "ProjectUnit", action: "update" })).toBe("edits");
    expect(windowOf({ model: "LeadInquiry", action: "update" })).toBe("edits");
  });

  it("never lets the edits rule reach a sign-in or a customer-data event", () => {
    // Otherwise the 30-day rule would delete three-year evidence after a month.
    const { edits } = auditPruneFilters(now);
    expect(edits.model).toEqual({ not: "Session" });
    expect(edits.action).toEqual({ notIn: ["reveal_contact", "erase_lead"] });
  });

  it("deletes by those three rules and reports the counts", async () => {
    deleteMany.mockResolvedValueOnce({ count: 40 }).mockResolvedValueOnce({ count: 3 }).mockResolvedValueOnce({ count: 0 });
    expect(await pruneAuditLog(now)).toEqual({ signIns: 40, edits: 3, customerData: 0 });
    expect(deleteMany).toHaveBeenCalledTimes(3);
    // Every deletion is bounded by age: none is unconditional.
    for (const [call] of deleteMany.mock.calls) expect(call.where.createdAt.lt).toBeInstanceOf(Date);
  });
});
