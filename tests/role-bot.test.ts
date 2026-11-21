/**
 * The BOT role: an account that works in the team's place. It reaches what
 * the owner reaches — customers, co-agents, the activity log, exports —
 * with one exception: the user accounts. It is ranked with ADMIN, not with
 * the owner, precisely so that every screen that manages accounts (which
 * all ask for the SUPER_ADMIN rank) stays shut; what it has beyond ADMIN
 * comes by capability. These tests pin both halves.
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
  it("is ranked with the administrator, below the owner", () => {
    expect(hasRole(Role.BOT, Role.ADMIN)).toBe(true);
    // The rank the account screens ask for. This line is the lock on them.
    expect(hasRole(Role.BOT, Role.SUPER_ADMIN)).toBe(false);
  });

  it("has every capability the owner has, except managing users", () => {
    for (const capability of CAPABILITIES) {
      expect(PERMISSION_MATRIX[capability]).toHaveProperty("BOT");
      if (capability === "manageUsers") expect(can(Role.BOT, capability)).toBe(false);
      else expect(can(Role.BOT, capability), capability).toBe(can(Role.SUPER_ADMIN, capability));
    }
  });

  it("sees the owner's menu without Users", () => {
    expect(canSeeItem(Role.BOT, "users")).toBe(false);
    for (const item of ["dashboard", "analytics", "seo", "reports", "leads", "coAgents", "mobileView", "projects", "pages", "news", "activity", "settings"]) {
      expect(canSeeItem(Role.BOT, item), item).toBe(canSeeItem(Role.SUPER_ADMIN, item));
      expect(canSeeItem(Role.BOT, item), item).toBe(true);
    }
  });

  it("can be excused from the second factor, which is what it is for", () => {
    expect(roleMayBeExempt(Role.BOT)).toBe(true);
  });

  describe("the user accounts stay shut", () => {
    // Every page and action that reads or changes an account asks for the
    // SUPER_ADMIN rank, which a bot does not have.
    it.each([
      ["page.tsx", "requireAdmin(locale, Role.SUPER_ADMIN)"],
      [join("[id]", "edit", "page.tsx"), "requireAdmin(locale, Role.SUPER_ADMIN)"],
    ])("users/%s", (file, guard) => {
      expect(read("app", "[locale]", "admin", "(system)", "users", file)).toContain(guard);
    });

    it("every users action asks for the owner's rank", () => {
      const source = read("app", "[locale]", "admin", "(system)", "users", "actions.ts");
      const actions = [...source.matchAll(/export async function (\w+)\(/g)].map((match) => match[1]);
      // changeOwnPassword is each account's own; the rest manage other people.
      for (const name of actions.filter((action) => action !== "changeOwnPassword")) {
        const body = source.slice(source.indexOf(`export async function ${name}(`));
        expect(body.slice(0, body.indexOf("\n}\n")), name).toContain("requireAdminAction(Role.SUPER_ADMIN)");
      }
    });
  });

  describe("what it has beyond an administrator comes by capability", () => {
    it.each([
      [["app", "[locale]", "admin", "(system)", "activity", "page.tsx"], 'requireCapability(locale, "viewAuditLog")'],
      [["app", "[locale]", "admin", "(system)", "activity", "actions.ts"], 'requireCapabilityAction("viewAuditLog")'],
      [["app", "api", "admin", "activity", "export", "route.ts"], 'requireCapabilityAction("viewAuditLog")'],
    ])("%s", (path, check) => {
      expect(read(...path)).toContain(check);
    });

    it("is on the co-agent screens' list", () => {
      expect(read("lib", "agents", "guard.ts")).toContain("Role.BOT");
    });
  });

  describe("it is not a person", () => {
    it("is never handed a lead and never sent a notification", () => {
      expect(read("lib", "lead-routing.ts")).toContain("role !== Role.BOT");
      expect(read("lib", "notifications.ts")).toContain('user.role !== "BOT"');
      expect(read("lib", "scheduled-alerts.ts")).toContain('u.role !== "BOT"');
    });
  });
});
