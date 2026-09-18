/**
 * tests/admin/growth-route-exceptions.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The (growth) zone's one per-route exception, actually run.
 *
 * tests/admin/permissions-nav.test.ts proves the nav and the guards agree
 * by reading source text — it cannot execute app/[locale]/admin/(growth)/
 * layout.tsx's own logic, because that layout decides its minimum from a
 * pathname it reads off a request header at runtime, not from a literal
 * `Role.X` its regex can match. A typo in the prefix string, a header the
 * proxy stopped setting, an `??` that binds the wrong way — none of those
 * would show up as a source-text mismatch, only as this layout quietly
 * admitting or refusing the wrong person. This drives the real function.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";
import { Role } from "@prisma/client";

type FakeSession = {
  user: { id: string; email: string; name: string; role: Role; twoFactorPending: boolean };
} | null;

let sessionQueue: FakeSession[] = [];
let pathnameHeader: string | null = "/en/admin/seo/translations";

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

describe("(growth) zone — the seo/translations exception", () => {
  it("admits EDITOR at the exempted path", async () => {
    pathnameHeader = "/en/admin/seo/translations";
    sessionQueue = [sessionFor(Role.EDITOR)];

    await expect(runLayout()).resolves.not.toThrow();
  });

  it("still refuses EDITOR everywhere else in the zone", async () => {
    pathnameHeader = "/en/admin/seo";
    sessionQueue = [sessionFor(Role.EDITOR)];

    await expect(runLayout()).rejects.toThrow("REDIRECT:/en/admin?denied=1");
  });

  it("admits ADMIN at the zone's ordinary floor", async () => {
    pathnameHeader = "/en/admin/seo";
    sessionQueue = [sessionFor(Role.ADMIN)];

    await expect(runLayout()).resolves.not.toThrow();
  });

  it("does not loosen the exempted path past EDITOR", async () => {
    pathnameHeader = "/en/admin/seo/translations";
    sessionQueue = [sessionFor(Role.VIEWER)];

    await expect(runLayout()).rejects.toThrow("REDIRECT:/en/admin?denied=1");
  });

  it("fails closed to ADMIN when the pathname header is missing", async () => {
    // proxy.ts stops setting x-admin-pathname, or something upstream
    // strips it — the layout's own header explains why this must not
    // become a silent EDITOR-wide opening of the whole zone.
    pathnameHeader = null;
    sessionQueue = [sessionFor(Role.EDITOR)];

    await expect(runLayout()).rejects.toThrow("REDIRECT:/en/admin?denied=1");
  });

  it("does not exempt a path that merely starts with the same characters", async () => {
    // A bare startsWith("/seo/translations") would also match
    // "/seo/translations-extra" — a different, hypothetical route that
    // must not inherit this exception just because the strings share a
    // prefix. The match has to be segment-aware.
    pathnameHeader = "/en/admin/seo/translations-extra";
    sessionQueue = [sessionFor(Role.EDITOR)];

    await expect(runLayout()).rejects.toThrow("REDIRECT:/en/admin?denied=1");
  });

  it("does exempt a real sub-route of the exempted path", async () => {
    pathnameHeader = "/en/admin/seo/translations/export";
    sessionQueue = [sessionFor(Role.EDITOR)];

    await expect(runLayout()).resolves.not.toThrow();
  });
});
