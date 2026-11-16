/**
 * The BOT role: an administrator's reach without customers, co-agents or
 * user accounts. Ranked with ADMIN, so everything it must not reach has to
 * be refused by capability or by an explicit role list — these tests pin
 * each of those refusals, because a rank check alone would let it through.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import { CAPABILITIES, PERMISSION_MATRIX, can } from "@/lib/permissions";
import { hasRole } from "@/lib/role-rank";
import { canSeeItem } from "@/lib/admin/nav";
import { roleMayBeExempt } from "@/lib/two-factor-policy";

const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), "utf8");

describe("the BOT role", () => {
  it("passes the gates an administrator passes, and not the owner's", () => {
    expect(hasRole(Role.BOT, Role.ADMIN)).toBe(true);
    expect(hasRole(Role.BOT, Role.SUPER_ADMIN)).toBe(false);
  });

  it("is refused everything about customers, the audit log and accounts", () => {
    for (const capability of ["viewAllLeads", "viewCustomerContact", "exportCustomerData", "viewAuditLog", "manageUsers"] as const) {
      expect(can(Role.BOT, capability), capability).toBe(false);
    }
  });

  it("otherwise has what ADMIN has", () => {
    for (const capability of ["viewContent", "editContent", "publishLive", "manageProjects"] as const) {
      expect(can(Role.BOT, capability), capability).toBe(can(Role.ADMIN, capability));
    }
    // Every capability has an answer for it: a missing cell reads as allowed.
    for (const capability of CAPABILITIES) expect(PERMISSION_MATRIX[capability]).toHaveProperty("BOT");
  });

  it("does not see leads, co-agents, users or the activity log in the menu", () => {
    for (const item of ["leads", "coAgents", "users", "activity", "mobileView"]) {
      expect(canSeeItem(Role.BOT, item), item).toBe(false);
    }
    for (const item of ["dashboard", "analytics", "seo", "reports", "projects", "pages", "news", "settings"]) {
      expect(canSeeItem(Role.BOT, item), item).toBe(true);
    }
  });

  it("can be excused from the second factor, which is what it is for", () => {
    expect(roleMayBeExempt(Role.BOT)).toBe(true);
  });

  describe("the lead doors that ask for a rank also ask for the capability", () => {
    // deleteLeads, the suspect queue and the CSV export all open at
    // Role.ADMIN, which BOT meets. Each must check the capability as well.
    it.each([
      [["app", "[locale]", "admin", "(crm)", "leads", "actions.ts"], 'can(actor.role, "viewAllLeads")'],
      [["app", "[locale]", "admin", "(crm)", "leads", "suspect", "actions.ts"], 'can(actor.role, "viewAllLeads")'],
      [["app", "[locale]", "admin", "(crm)", "leads", "suspect", "page.tsx"], 'can(session.role, "viewAllLeads")'],
      [["app", "api", "admin", "leads", "export", "route.ts"], 'can(actor.role, "exportCustomerData")'],
    ])("%s", (path, check) => {
      expect(read(...path)).toContain(check);
    });

    it("keeps the co-agent screens on an explicit list without BOT", () => {
      const guard = read("lib", "agents", "guard.ts");
      expect(guard).toContain("new Set([Role.SUPER_ADMIN, Role.ADMIN, Role.SALES])");
    });

    it("keeps every other lead path on the capability, not on a rank", () => {
      const crm = ["leads/page.tsx", "leads/[id]/page.tsx", "appointments/page.tsx", "appointments/actions.ts", "m/page.tsx", "m/leads/page.tsx", "m/leads/[id]/page.tsx"];
      for (const file of crm) {
        const source = read("app", "[locale]", "admin", "(crm)", ...file.split("/"));
        expect(source, file).toMatch(/requireCapability(Action)?\(/);
      }
    });
  });
});
