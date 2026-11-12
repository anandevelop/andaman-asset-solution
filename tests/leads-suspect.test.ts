/**
 * tests/leads-suspect.test.ts
 * Letting a held enquiry through, and marking one spam.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  suspectLead: { findUnique: vi.fn(), delete: vi.fn() },
  leadInquiry: { create: vi.fn() },
  leadBlock: { upsert: vi.fn() },
}));
const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  suspectLead: { deleteMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  project: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const announceLead = vi.hoisted(() => vi.fn());
vi.mock("@/lib/leads/capture", () => ({ announceLead }));

import { listSuspects, markSuspectSpam, releaseSuspect } from "@/lib/leads/suspect";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe("releaseSuspect", () => {
  it("creates the lead from what was held, with its dates restored, and announces it", async () => {
    tx.suspectLead.findUnique.mockResolvedValue({
      id: "s1",
      input: { name: "Nikolai", email: "n@x.com", phone: "+66998877665", consentGiven: true, consentedAt: "2026-11-12T01:00:00.000Z" },
      notice: { name: "Nikolai", projectId: null },
    });
    tx.leadInquiry.create.mockResolvedValue({ id: "lead9" });

    await expect(releaseSuspect("s1")).resolves.toEqual({ leadId: "lead9" });
    expect(tx.leadInquiry.create.mock.calls[0][0].data.consentedAt).toEqual(new Date("2026-11-12T01:00:00.000Z"));
    expect(tx.suspectLead.delete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(announceLead).toHaveBeenCalledWith("lead9", { name: "Nikolai", projectId: null });
  });

  it("returns null for one already handled", async () => {
    tx.suspectLead.findUnique.mockResolvedValue(null);
    await expect(releaseSuspect("gone")).resolves.toBeNull();
    expect(announceLead).not.toHaveBeenCalled();
  });
});

describe("markSuspectSpam", () => {
  it("blocks the email and the phone, then deletes", async () => {
    tx.suspectLead.findUnique.mockResolvedValue({ email: "Spam@X.com", phone: "+66800000000" });
    await expect(markSuspectSpam("s2", "admin1")).resolves.toBe(true);
    const values = tx.leadBlock.upsert.mock.calls.map(([arg]) => arg.create);
    expect(values).toEqual([
      { kind: "email", value: "spam@x.com", createdById: "admin1" },
      { kind: "phone", value: "+66800000000", createdById: "admin1" },
    ]);
    expect(tx.suspectLead.delete).toHaveBeenCalled();
  });
});

describe("listSuspects", () => {
  it("purges old rows and names the project", async () => {
    prismaMock.suspectLead.findMany.mockResolvedValue([
      { id: "s1", createdAt: new Date(), name: "a", email: "e", phone: "p", message: null, projectId: "p1", reasons: ["name_test"] },
    ]);
    prismaMock.project.findMany.mockResolvedValue([{ id: "p1", nameEn: "The Victory" }]);
    const rows = await listSuspects(new Date("2026-11-12T00:00:00Z"));
    expect(prismaMock.suspectLead.deleteMany.mock.calls[0][0].where.createdAt.lt).toEqual(new Date("2026-09-13T00:00:00Z"));
    expect(rows[0].projectName).toBe("The Victory");
  });
});
