import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  The jwt callback re-reads the user every few minutes. A deleted user came
  back as null, which was read as "database unreachable, keep the claims",
  so a deleted (not deactivated) staff member stayed signed in for as long
  as they kept using the admin. These pin the three answers apart.
*/

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique }, auditLog: { create: vi.fn() } } }));

const { authOptions } = await import("@/lib/auth");

/** A session whose last check was long enough ago to be re-read now. */
function staleToken() {
  return {
    id: "user-9",
    sub: "user-9",
    name: "Editor",
    role: "EDITOR",
    twoFactorEnabled: true,
    issuedAt: Date.now() - 60_000,
    checkedAt: Date.now() - 24 * 3_600_000,
  };
}

async function refresh(token: Record<string, unknown>) {
  return authOptions.callbacks!.jwt!({ token, trigger: undefined } as never);
}

beforeEach(() => findUnique.mockReset());

describe("jwt refresh", () => {
  it("signs out a user who has been deleted", async () => {
    findUnique.mockResolvedValue(null);
    expect(await refresh(staleToken())).toEqual({});
  });

  it("signs out a user who has been deactivated", async () => {
    findUnique.mockResolvedValue({ name: "Editor", role: "EDITOR", isActive: false, totpEnabledAt: new Date(), credentialsChangedAt: null });
    expect(await refresh(staleToken())).toEqual({});
  });

  it("keeps the claims when the database cannot be reached", async () => {
    // A PrismaPromise stand-in that fails. A plain rejected promise would be
    // flagged by Vitest itself, which chains onto every mock's return value.
    findUnique.mockImplementation(() => ({
      catch: (handle: (error: Error) => unknown) => Promise.resolve(handle(new Error("ECONNREFUSED"))),
    }));
    const token = await refresh(staleToken());
    expect(token).toMatchObject({ id: "user-9", role: "EDITOR" });
  });

  it("refreshes an active user's role", async () => {
    findUnique.mockResolvedValue({ name: "Editor", role: "ADMIN", isActive: true, totpEnabledAt: new Date(), credentialsChangedAt: null });
    expect(await refresh(staleToken())).toMatchObject({ id: "user-9", role: "ADMIN" });
  });
});
