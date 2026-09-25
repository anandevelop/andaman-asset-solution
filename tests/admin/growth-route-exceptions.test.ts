/**
 * tests/admin/growth-route-exceptions.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The (growth) zone's per-route exception slot, actually run.
 *
 * tests/admin/permissions-nav.test.ts proves the nav and the guards agree
 * by reading source text — it cannot execute app/[locale]/admin/(growth)/
 * layout.tsx's own logic, because that layout decides its minimum from a
 * pathname it reads off a request header at runtime, not from a literal
 * `Role.X` its regex can match. A typo in the prefix string, a header the
 * proxy stopped setting, an `??` that binds the wrong way — none of those
 * would show up as a source-text mismatch, only as this layout quietly
 * admitting or refusing the wrong person.
 *
 * WHY MOST OF IT NOW RUNS AGAINST A FIXTURE
 *
 * ROUTE_EXCEPTIONS is empty: /seo/translations, its only ever entry, moved
 * to /admin/publishing/translations where the floor it needed is the
 * ordinary one. Driving the matching rules through the live array would
 * therefore drive them through nothing, and the suite would go on passing
 * while checking that an empty list matches no paths — which is not the
 * property anybody cares about. The rules are tested against a fixture
 * through exceptionFor(); the layout is tested separately for what it does
 * with an empty array, which is refuse everyone below ADMIN.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

type FakeSession = {
  user: { id: string; email: string; name: string; role: Role; twoFactorPending: boolean };
} | null;

let sessionQueue: FakeSession[] = [];
let pathnameHeader: string | null = "/en/admin/seo";

vi.mock("next-auth", () => ({
  getServerSession: async () => sessionQueue.shift() ?? null,
}));

vi.mock("@/lib/auth", async () => {
  const rank = await vi.importActual<typeof import("@/lib/role-rank")>("@/lib/role-rank");
  return { authOptions: {}, hasRole: rank.hasRole };
});

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => (name === "x-admin-pathname" ? pathnameHeader : null) }),
}));

function sessionFor(role: Role): FakeSession {
  return {
    user: { id: "u1", email: "person@andaman.test", name: "Person", role, twoFactorPending: false },
  };
}

async function runLayout() {
  const { default: AdminGrowthLayout } = await import(
    "@/app/[locale]/admin/(growth)/layout"
  );
  return AdminGrowthLayout({
    children: null,
    params: Promise.resolve({ locale: "en" }),
  } as never);
}

describe("(growth) zone — the live guard", () => {
  it("admits ADMIN at the zone's floor", async () => {
    pathnameHeader = "/en/admin/seo";
    sessionQueue = [sessionFor(Role.ADMIN)];

    await expect(runLayout()).resolves.not.toThrow();
  });

  it("refuses EDITOR everywhere in the zone", async () => {
    // With no exceptions left, this is the whole rule. The one route that
    // used to be exempt is not in this zone any more.
    for (const path of ["/en/admin/seo", "/en/admin/seo/translations", "/en/admin/analytics"]) {
      pathnameHeader = path;
      sessionQueue = [sessionFor(Role.EDITOR)];

      await expect(runLayout(), path).rejects.toThrow("REDIRECT:/en/admin?denied=1");
    }
  });

  it("fails closed to ADMIN when the pathname header is missing", async () => {
    // proxy.ts stops setting x-admin-pathname, or something upstream
    // strips it — the layout's own header explains why this must not
    // become a silent zone-wide opening.
    pathnameHeader = null;
    sessionQueue = [sessionFor(Role.EDITOR)];

    await expect(runLayout()).rejects.toThrow("REDIRECT:/en/admin?denied=1");
  });

  it("keeps the exception list empty", async () => {
    /* Not style policing: an entry here loosens a zone whose whole point
       is that redirects and structured data are not an editor's to change,
       so one arriving without the header above being rewritten to say why
       is the thing to catch. */
    const { ROUTE_EXCEPTIONS } = await import("@/app/[locale]/admin/(growth)/layout");

    expect(ROUTE_EXCEPTIONS).toEqual([]);
  });
});

describe("exceptionFor", () => {
  /* A fixture, because the live array is empty — see this file's header.
     These are the rules the next entry will inherit, whatever it is. */
  const FIXTURE = [{ prefix: "/seo/example", minimum: Role.EDITOR }] as const;

  it("matches the exempted path itself", async () => {
    const { exceptionFor } = await import("@/app/[locale]/admin/(growth)/layout");

    expect(exceptionFor("/seo/example", FIXTURE)?.minimum).toBe(Role.EDITOR);
  });

  it("matches a real sub-route of it", async () => {
    const { exceptionFor } = await import("@/app/[locale]/admin/(growth)/layout");

    expect(exceptionFor("/seo/example/export", FIXTURE)?.minimum).toBe(Role.EDITOR);
  });

  it("does not match a path that merely shares the prefix string", async () => {
    // A bare startsWith("/seo/example") would also match
    // "/seo/example-extra" — a different route that must not inherit the
    // exception just because the strings begin the same way.
    const { exceptionFor } = await import("@/app/[locale]/admin/(growth)/layout");

    expect(exceptionFor("/seo/example-extra", FIXTURE)).toBeUndefined();
  });

  it("matches nothing when the pathname is unknown", async () => {
    const { exceptionFor } = await import("@/app/[locale]/admin/(growth)/layout");

    expect(exceptionFor(null, FIXTURE)).toBeUndefined();
  });

  it("matches nothing against an empty list", async () => {
    const { exceptionFor } = await import("@/app/[locale]/admin/(growth)/layout");

    expect(exceptionFor("/seo/example", [])).toBeUndefined();
  });
});
