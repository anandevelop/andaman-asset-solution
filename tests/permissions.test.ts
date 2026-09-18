/**
 * tests/permissions.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The permission matrix, and the one rule it exists to hold.
 *
 * A content editor must not be able to read customer contact details. That
 * was true of the design and false of the code: EDITOR outranks SALES in
 * lib/role-rank.ts, so guarding the leads pages with
 * hasRole(role, Role.SALES) admitted every editor to the whole enquiry
 * list — names, phone numbers, email addresses.
 *
 * The fix was to guard on a capability instead. These tests are what stops
 * it regressing the next time someone reaches for the rank helper, and
 * they also check the structural promise the Users page makes: that the
 * table it draws is the table the guards read.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Role } from "@prisma/client";
import {
  CAPABILITIES,
  PERMISSION_MATRIX,
  ROLE_ORDER,
  can,
  canFully,
} from "@/lib/permissions";

describe("customer contact details", () => {
  it("are closed to content editors", () => {
    expect(can(Role.EDITOR, "viewCustomerContact")).toBe(false);
    expect(can(Role.EDITOR, "viewAllLeads")).toBe(false);
  });

  it("are closed to viewers", () => {
    expect(can(Role.VIEWER, "viewCustomerContact")).toBe(false);
    expect(can(Role.VIEWER, "viewAllLeads")).toBe(false);
  });

  it("are open to sales only for their own leads", () => {
    expect(can(Role.SALES, "viewCustomerContact")).toBe(true);
    // Allowed, but never unrestricted — the row scoping in the lead
    // queries is what the narrowed grant refers to.
    expect(canFully(Role.SALES, "viewCustomerContact")).toBe(false);
  });

  it("are open without restriction to admins", () => {
    expect(canFully(Role.ADMIN, "viewCustomerContact")).toBe(true);
    expect(canFully(Role.SUPER_ADMIN, "viewCustomerContact")).toBe(true);
  });

  it("can only be exported by an admin", () => {
    for (const role of [Role.EDITOR, Role.SALES, Role.VIEWER]) {
      expect(can(role, "exportCustomerData"), role).toBe(false);
    }
    expect(can(Role.ADMIN, "exportCustomerData")).toBe(true);
  });
});

describe("the matrix itself", () => {
  it("gives every capability an answer for every role", () => {
    for (const capability of CAPABILITIES) {
      for (const role of ROLE_ORDER) {
        expect(PERMISSION_MATRIX[capability][role], `${capability}/${role}`).toBeDefined();
      }
    }
  });

  it("covers every role the schema defines", () => {
    expect([...ROLE_ORDER].sort()).toEqual([...Object.values(Role)].sort());
  });

  it("never grants a lower role something SUPER_ADMIN lacks", () => {
    for (const capability of CAPABILITIES) {
      expect(PERMISSION_MATRIX[capability][Role.SUPER_ADMIN], capability).not.toBe(false);
    }
  });
});

describe("the pages that show customer records", () => {
  /*
    Structural: these are async Server Components that reach for Prisma and
    next/headers, so the cheap check is the one that greps them — the same
    reasoning as tests/offline-notice.test.ts.
  */
  const CRM_PAGES = [
    "app/[locale]/admin/(crm)/leads/page.tsx",
    "app/[locale]/admin/(crm)/leads/[id]/page.tsx",
    "app/[locale]/admin/(crm)/appointments/page.tsx",
    "app/[locale]/admin/(crm)/m/page.tsx",
    "app/[locale]/admin/(crm)/m/leads/page.tsx",
    "app/[locale]/admin/(crm)/m/leads/[id]/page.tsx",
  ];

  it("guard on the capability, never on rank", () => {
    const offenders = CRM_PAGES.filter((page) => {
      const source = readFileSync(join(process.cwd(), page), "utf8");
      // The comment explaining the switch mentions the old call, so match
      // on it being *called* rather than merely named.
      return (
        !source.includes('requireCapability(locale, "viewAllLeads")') ||
        /await requireAdmin\(locale, Role\.SALES\)/.test(source)
      );
    });

    expect(offenders).toEqual([]);
  });
});
