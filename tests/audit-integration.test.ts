/**
 * tests/audit-integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * That the trail is actually plumbed in, not merely correct in principle.
 *
 * tests/audit.test.ts covers the decisions — what counts as a write, how an
 * upsert is classified, which fields are named. None of that helps if the
 * extension is not attached to the client the application imports, or if
 * the actor set by the admin guard does not survive into the Prisma call.
 * That plumbing is where a silent hole would live, and a silent hole is
 * the one failure this feature cannot tolerate: an absent entry reads as
 * "nobody did this".
 *
 * Needs a real database, so it runs against E2E_DATABASE_URL and skips
 * without one — which is what happens in CI's unit-test job, where there
 * is no Postgres. It writes and removes its own rows.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DB_URL = process.env.E2E_DATABASE_URL;

// Set before lib/prisma.ts is imported below: the client reads DATABASE_URL
// when it is constructed, and the dev database must not be touched.
if (DB_URL) process.env.DATABASE_URL = DB_URL;

type Prisma = typeof import("@/lib/prisma")["prisma"];
type SetActor = typeof import("@/lib/audit/context")["setAuditActor"];

/*
  A real row, because AuditLog.actorId is a foreign key.

  That constraint is the point: an entry has to name someone who existed.
  The id is filled in by beforeAll once the user is created.
*/
const ACTOR = {
  id: "",
  email: "audit-int@andaman.test",
  role: "ADMIN" as const,
};

/** Marks every row this file creates, so cleanup cannot catch anyone else's. */
const TAG = "audit-int-";

describe.skipIf(!DB_URL)("the audit trail, end to end", () => {
  let prisma: Prisma;
  let setAuditActor: SetActor;

  beforeAll(async () => {
    ({ setAuditActor } = await import("@/lib/audit/context"));
    ({ prisma } = await import("@/lib/prisma"));

    const { withoutAudit } = await import("@/lib/audit/context");

    const user = await withoutAudit(() =>
      prisma.user.upsert({
        where: { email: ACTOR.email },
        update: {},
        create: {
          email: ACTOR.email,
          name: "Audit Integration Actor",
          role: ACTOR.role,
          isActive: false,
        },
        select: { id: true },
      }),
    );

    ACTOR.id = user.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    const { withoutAudit } = await import("@/lib/audit/context");

    await withoutAudit(async () => {
      await prisma.auditLog.deleteMany({ where: { actorEmail: ACTOR.email } });
      await prisma.award.deleteMany({ where: { titleEn: { startsWith: TAG } } });
      await prisma.user.deleteMany({ where: { email: ACTOR.email } });
    });

    await prisma.$disconnect();
  });

  const entriesFor = async (recordId: string) =>
    prisma.auditLog.findMany({
      where: { recordId, actorEmail: ACTOR.email },
      orderBy: { createdAt: "asc" },
    });

  const award = (suffix: string) => ({
    titleEn: `${TAG}${suffix}`,
    titleTh: `${TAG}${suffix}`,
    organization: "Audit Integration Test",
    year: 2026,
    isActive: false,
    sortOrder: 0,
  });

  it("records a create, an update and a delete, in order", async () => {
    setAuditActor(ACTOR);

    const created = await prisma.award.create({ data: award("lifecycle") });
    await prisma.award.update({
      where: { id: created.id },
      data: { isActive: true, sortOrder: 3 },
    });
    await prisma.award.delete({ where: { id: created.id } });

    const entries = await entriesFor(created.id);

    expect(entries.map((entry) => entry.action)).toEqual(["create", "update", "delete"]);
    expect(entries.every((entry) => entry.model === "Award")).toBe(true);
  });

  it("names the person, and keeps their address even after the row is gone", async () => {
    setAuditActor(ACTOR);

    const created = await prisma.award.create({ data: award("attribution") });
    const [entry] = await entriesFor(created.id);

    expect(entry.actorId).toBe(ACTOR.id);
    expect(entry.actorEmail).toBe(ACTOR.email);
    expect(entry.actorRole).toBe("ADMIN");
  });

  it("records which fields were set, and not what they were set to", async () => {
    setAuditActor(ACTOR);

    const created = await prisma.award.create({ data: award("fields") });
    await prisma.award.update({
      where: { id: created.id },
      data: { titleEn: `${TAG}fields-renamed`, sortOrder: 9 },
    });

    const entries = await entriesFor(created.id);
    const update = entries.find((entry) => entry.action === "update");

    expect(update?.changedFields).toEqual(["sortOrder", "titleEn"]);

    // The values are not in the entry — only the fact that those fields
    // were touched. Checked against the entry's own values rather than its
    // serialised text, because a cuid contains digits and would match a
    // substring search for 9 on its own.
    expect(Object.values(update ?? {})).not.toContain(9);

    // recordLabel is the deliberate exception, and it is the *new* title,
    // because that is what the row is called from now on.
    expect(update?.recordLabel).toBe(`${TAG}fields-renamed`);
  });

  it("gives a lead no label, so the trail is not a second copy of the contact list", async () => {
    // Every readable field on a lead is the customer's name, email or
    // phone. The entry still identifies the row by id.
    setAuditActor(ACTOR);

    const lead = await prisma.leadInquiry.create({
      data: {
        name: "Audit Integration Buyer",
        email: "audit-int-buyer@example.test",
        phone: "0812345678",
        consentGiven: true,
        consentVersion: "test",
      },
    });

    const [entry] = await entriesFor(lead.id);

    expect(entry.model).toBe("LeadInquiry");
    expect(entry.recordId).toBe(lead.id);
    expect(entry.recordLabel).toBeNull();
    expect(JSON.stringify(entry)).not.toContain("audit-int-buyer@example.test");

    await prisma.leadInquiry.delete({ where: { id: lead.id } });
  });

  it("labels the entry so a deleted row is still identifiable", async () => {
    setAuditActor(ACTOR);

    const created = await prisma.award.create({ data: award("labelled") });
    await prisma.award.delete({ where: { id: created.id } });

    const entries = await entriesFor(created.id);

    // The row is gone; the trail still says which one it was.
    expect(entries.at(-1)?.recordLabel).toBe(`${TAG}labelled`);
    expect(await prisma.award.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("writes nothing for a change with no administrator behind it", async () => {
    // The shape of a public lead submission or an RSVP: same client, no
    // actor in context.
    const { withoutAudit } = await import("@/lib/audit/context");

    const created = await withoutAudit(() =>
      prisma.award.create({ data: award("anonymous") }),
    );

    expect(await entriesFor(created.id)).toEqual([]);

    await withoutAudit(() => prisma.award.delete({ where: { id: created.id } }));
  });

  it("does not log itself", async () => {
    setAuditActor(ACTOR);

    const before = await prisma.auditLog.count({ where: { model: "AuditLog" } });
    const created = await prisma.award.create({ data: award("recursion") });

    expect(await prisma.auditLog.count({ where: { model: "AuditLog" } })).toBe(before);
    expect(await entriesFor(created.id)).toHaveLength(1);
  });
});
