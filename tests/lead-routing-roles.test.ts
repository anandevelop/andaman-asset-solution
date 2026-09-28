/**
 * tests/lead-routing-roles.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who the lead router is allowed to pick.
 *
 * The router gated on two things — an active account, an active sales
 * profile — and never on the account's role. A VIEWER is read-only
 * everywhere it can reach, so a lead handed to one lands where nobody can
 * change its status, add a note, or close it: it sits on the board looking
 * claimed and ages quietly. Nothing could write User.salesPersonId from the
 * admin at the time, so no VIEWER ever held a profile and the gap stayed
 * theoretical — until the users page grew the control that writes it.
 *
 * The rule is asserted at both ends, because one without the other is how
 * it drifts back apart: the SQL the router sends, and the predicate the
 * roster screen renders from.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";
import { rolesAtLeast } from "@/lib/role-rank";

const prismaMock = vi.hoisted(() => ({
  siteSetting: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const { LEAD_CANDIDATE_WHERE, LEAD_ROLE_MINIMUM, decideAssignee, roleCanHoldLeads } =
  await import("@/lib/lead-routing");

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.siteSetting.findUnique.mockResolvedValue({
    value: JSON.stringify({ enabled: true, perPersonCap: 40 }),
  });
  prismaMock.user.findMany.mockResolvedValue([]);
});

describe("rolesAtLeast", () => {
  it("returns every role at or above the minimum", () => {
    expect([...rolesAtLeast(Role.SALES)].sort()).toEqual(
      [Role.SALES, Role.EDITOR, Role.ADMIN, Role.SUPER_ADMIN].sort(),
    );
  });

  it("excludes VIEWER from the roles that may hold a lead", () => {
    expect(rolesAtLeast(LEAD_ROLE_MINIMUM)).not.toContain(Role.VIEWER);
  });

  it("is derived from the ladder, not a hand-kept list", () => {
    // SUPER_ADMIN is above everything, so asking for the top of the ladder
    // returns exactly one role. A hardcoded array would not narrow.
    expect(rolesAtLeast(Role.SUPER_ADMIN)).toEqual([Role.SUPER_ADMIN]);
    expect(rolesAtLeast(Role.VIEWER)).toHaveLength(5);
  });
});

describe("roleCanHoldLeads", () => {
  it("refuses VIEWER", () => {
    expect(roleCanHoldLeads(Role.VIEWER)).toBe(false);
  });

  it("accepts SALES and everything above it", () => {
    for (const role of [Role.SALES, Role.EDITOR, Role.ADMIN, Role.SUPER_ADMIN]) {
      expect(roleCanHoldLeads(role)).toBe(true);
    }
  });
});

describe("the candidate filter", () => {
  it("requires an active account, an eligible role and an active profile", () => {
    expect(LEAD_CANDIDATE_WHERE).toEqual({
      isActive: true,
      role: { in: expect.arrayContaining([Role.SALES]) },
      salesPersonId: { not: null },
      salesPerson: { isActive: true },
    });
  });

  it("does not list VIEWER among the roles it will select", () => {
    expect(LEAD_CANDIDATE_WHERE.role.in).not.toContain(Role.VIEWER);
  });
});

describe("decideAssignee", () => {
  it("asks Postgres only for accounts in a role that can act on a lead", async () => {
    await decideAssignee({ commsLanguage: "th" });

    const [{ where }] = prismaMock.user.findMany.mock.calls[0];
    expect(where.role.in).not.toContain(Role.VIEWER);
    expect(where.role.in).toContain(Role.SALES);
    // The clauses that were already there must survive the new one.
    expect(where.isActive).toBe(true);
    expect(where.salesPerson).toEqual({ isActive: true });
  });

  it("still assigns an eligible rep", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "rep-1", _count: { assignedLeads: 2 } },
    ]);

    const decision = await decideAssignee({ commsLanguage: "th" });
    expect(decision).toEqual({ userId: "rep-1", reason: "roundRobin" });
  });

  it("reports no candidates rather than picking an ineligible one", async () => {
    // What the query returns once the role clause has excluded everybody.
    prismaMock.user.findMany.mockResolvedValue([]);

    const decision = await decideAssignee({ commsLanguage: "th" });
    expect(decision).toEqual({ userId: null, reason: "noCandidates" });
  });

  it("ignores a language rule pointing at someone the query did not return", async () => {
    /*
      The routing panel stores a user id, and a rule outlives the account it
      names being demoted. The lead must not be assigned to them on the
      strength of the stale rule — it falls through to workload instead.
    */
    prismaMock.siteSetting.findUnique.mockResolvedValue({
      value: JSON.stringify({
        enabled: true,
        perPersonCap: 40,
        byLanguage: { th: "demoted-rep" },
      }),
    });
    prismaMock.user.findMany.mockResolvedValue([
      { id: "rep-1", _count: { assignedLeads: 7 } },
    ]);

    const decision = await decideAssignee({ commsLanguage: "th" });
    expect(decision.userId).toBe("rep-1");
    expect(decision.reason).toBe("roundRobin");
  });
});
