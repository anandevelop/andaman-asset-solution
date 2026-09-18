/**
 * tests/admin/content-actions-viewer.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Phase 4 opened (catalog) and (content) to VIEWER for reading. Every
 * write path in both zones has to keep refusing them regardless — the
 * zone layout only ever decides who may *load* a page (see its own file
 * header), and a page's `canWrite` fieldset is a rendering nicety, not the
 * boundary. The real boundary is each action's own requireAdminAction(),
 * which this drives directly rather than through a form: a fieldset a
 * browser correctly disables says nothing about a POST built by hand.
 *
 * Mocking next-auth and re-exporting the real hasRole (from
 * lib/role-rank.ts, which has zero imports of its own) is the same
 * approach tests/audit-context.test.ts uses, for the same reason: `@/lib/
 * auth` pulls in bcryptjs and Prisma, and this file has no use for either
 * — only the rank comparison the guard actually calls.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";
import { hasRole } from "@/lib/role-rank";

type FakeSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    twoFactorPending: boolean;
  };
} | null;

let nextSession: FakeSession = null;

vi.mock("next-auth", () => ({
  getServerSession: async () => nextSession,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
  hasRole,
}));

const VIEWER: FakeSession = {
  user: {
    id: "viewer-1",
    email: "viewer@andaman.test",
    name: "Viewer",
    role: "VIEWER",
    twoFactorPending: false,
  },
};

describe("VIEWER against write actions in the zones Phase 4 opened for reading", () => {
  it("is refused by the (content) zone's news actions", async () => {
    const { createArticle } = await import("@/app/[locale]/admin/(content)/news/actions");
    nextSession = VIEWER;

    await expect(
      createArticle("en", { ok: false }, new FormData()),
    ).rejects.toThrow("UNAUTHORISED");
  });

  it("is refused by the (content) zone's corporate-services action", async () => {
    const { createCorporateService } = await import(
      "@/app/[locale]/admin/(content)/pages/about/corporate/actions"
    );
    nextSession = VIEWER;

    await expect(
      createCorporateService("en", { ok: false }, new FormData()),
    ).rejects.toThrow("UNAUTHORISED");
  });

  it("is refused by the (catalog) zone's project actions", async () => {
    const { updateProject } = await import(
      "@/app/[locale]/admin/(catalog)/projects/actions"
    );
    nextSession = VIEWER;

    await expect(
      updateProject("en", "some-id", { ok: false }, new FormData()),
    ).rejects.toThrow("UNAUTHORISED");
  });

  it("is refused by the (catalog) zone's e-brochure actions", async () => {
    const { deleteBrochure } = await import(
      "@/app/[locale]/admin/(catalog)/e-brochures/actions"
    );
    nextSession = VIEWER;

    await expect(deleteBrochure("en", "some-id")).rejects.toThrow("UNAUTHORISED");
  });
});
