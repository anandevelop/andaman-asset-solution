/**
 * tests/audit-auth-events.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * That signing in and out reaches the trail, and that nothing else does.
 *
 * These two entries are written directly rather than by the Prisma
 * extension, because a sign-in is not a write to any table and there is
 * nothing for the extension to watch. That makes them the one part of the
 * trail with its own call sites — so they are also the one part that can be
 * wired to the wrong thing, or to nothing, and still look fine.
 *
 * The handlers are exercised through authOptions itself rather than through
 * recordAuthEvent(). Calling the helper directly would prove the helper
 * works while leaving the question that actually matters — whether NextAuth
 * is ever going to call it, and with what — untested.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_LOGIN,
  AUTH_LOGIN_FAILED,
  AUTH_LOGOUT,
  AUTH_MODEL,
  AUTH_TOTP_FAILED,
  isAuthEvent,
  isFailedAuth,
} from "@/lib/audit/events";

const { create, findUnique, compare, consume } = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  compare: vi.fn(),
  consume: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { auditLog: { create }, user: { findUnique } },
}));

// Real bcrypt at cost 12 would put seconds on the rate-limit test below,
// which needs eleven attempts to prove where the cap falls.
vi.mock("bcryptjs", () => ({ default: { compare } }));

vi.mock("@/lib/two-factor", () => ({ consumeSecondFactor: consume }));

const USER = {
  id: "user-1",
  email: "super@andaman.test",
  name: "Super Admin",
  role: "SUPER_ADMIN",
};

/** The decoded JWT NextAuth hands the signOut event. */
const TOKEN = {
  id: "user-1",
  email: "super@andaman.test",
  role: "SUPER_ADMIN",
};

async function events() {
  const { authOptions } = await import("@/lib/auth");
  // Both are optional in the NextAuth types and required by this feature;
  // asserting here means a config refactor that drops them fails loudly.
  expect(authOptions.events?.signIn).toBeTypeOf("function");
  expect(authOptions.events?.signOut).toBeTypeOf("function");
  return authOptions.events!;
}

/** The `data` of the single create() call. */
const written = () => create.mock.calls[0][0].data;

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: "entry-1" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("signing in", () => {
  it("records an entry naming the person and the moment", async () => {
    const { signIn } = await events();

    await signIn!({ user: USER } as never);

    expect(create).toHaveBeenCalledTimes(1);
    expect(written()).toMatchObject({
      actorId: USER.id,
      actorEmail: USER.email,
      actorRole: "SUPER_ADMIN",
      action: AUTH_LOGIN,
      model: AUTH_MODEL,
    });
  });

  it("names no record, because there is no record", async () => {
    const { signIn } = await events();

    await signIn!({ user: USER } as never);

    // createdAt is the whole payload of an auth entry. A recordLabel here
    // would be a value invented to fill a column.
    expect(written()).toMatchObject({
      recordId: null,
      recordLabel: null,
      changedFields: [],
    });
  });

  it("writes nothing for a user the provider did not fully identify", async () => {
    const { signIn } = await events();

    await signIn!({ user: { id: "user-1" } } as never);

    // An entry that cannot say who or with what authority is worse than no
    // entry: it is a name-shaped hole in a table people trust.
    expect(create).not.toHaveBeenCalled();
  });

  it("does not fail the sign-in when the trail cannot be written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValueOnce(new Error("database is down"));

    const { signIn } = await events();

    /*
      The most expensive place in the application to throw. NextAuth awaits
      this handler, so a rejection here turns a correct password into a
      sign-in error — and the user, having done nothing wrong, tries again
      and gets the same thing.
    */
    await expect(signIn!({ user: USER } as never)).resolves.toBeUndefined();
  });
});

describe("signing out", () => {
  it("records the departure from the token", async () => {
    const { signOut } = await events();

    await signOut!({ token: TOKEN } as never);

    expect(written()).toMatchObject({
      actorId: TOKEN.id,
      actorEmail: TOKEN.email,
      actorRole: "SUPER_ADMIN",
      action: AUTH_LOGOUT,
      model: AUTH_MODEL,
    });
  });

  it("writes nothing when the session was revoked rather than ended", async () => {
    const { signOut } = await events();

    /*
      The jwt callback empties the token to sign out a deactivated account,
      or one whose password was reset from under it. Nobody pressed
      anything, and there is no id to attribute a departure to — recording
      one would put a person in the log at a moment they were not there.
    */
    await signOut!({ token: {} } as never);

    expect(create).not.toHaveBeenCalled();
  });
});

/*
  The failure paths live in authorize(), not in the events block, so they
  are driven through the provider the same way NextAuth drives it. Each
  test uses its own address: lib/rate-limit keys its buckets by email and
  keeps them in module state, so sharing one would make these tests depend
  on the order they run in.
*/
async function authorize(credentials: Record<string, string>) {
  const { authOptions } = await import("@/lib/auth");

  /*
    CredentialsProvider() returns a config whose top-level `authorize` is a
    stub that always resolves null; the function lib/auth.ts actually wrote
    is kept on `.options` and merged in when NextAuth initialises the
    provider. Calling the stub tests nothing and looks like a pass, so the
    shape is asserted rather than assumed — a next-auth upgrade that moves
    it fails here instead of quietly turning these five tests into
    assertions about an empty function.
  */
  const provider = authOptions.providers[0] as unknown as {
    options?: { authorize?: (c: Record<string, string>) => Promise<unknown> };
  };

  const authorizeCredentials = provider.options?.authorize;
  expect(authorizeCredentials).toBeTypeOf("function");

  return authorizeCredentials!(credentials);
}

const ACCOUNT = {
  id: "user-7",
  name: "Editor",
  email: "editor@andaman.test",
  image: null,
  role: "EDITOR",
  isActive: true,
  passwordHash: "stored-hash",
  totpEnabledAt: null as Date | null,
};

describe("a sign-in that fails", () => {
  it("records an address that belongs to nobody, naming no one", async () => {
    findUnique.mockResolvedValue(null);
    compare.mockResolvedValue(false);

    await authorize({ email: "stranger-1@example.com", password: "guess" });

    expect(create).toHaveBeenCalledTimes(1);
    expect(written()).toMatchObject({
      action: AUTH_LOGIN_FAILED,
      model: AUTH_MODEL,
      actorEmail: "stranger-1@example.com",
      // No account, so no id and no role. A role here would read as a
      // permission level somebody actually held.
      actorId: null,
      actorRole: null,
    });
  });

  it("records a wrong password against the account it was aimed at", async () => {
    findUnique.mockResolvedValue({ ...ACCOUNT, email: "target-2@andaman.test" });
    compare.mockResolvedValue(false);

    await authorize({ email: "target-2@andaman.test", password: "wrong" });

    expect(written()).toMatchObject({
      action: AUTH_LOGIN_FAILED,
      actorId: ACCOUNT.id,
      actorRole: "EDITOR",
    });
  });

  it("marks a wrong second factor differently, because the password was right", async () => {
    findUnique.mockResolvedValue({
      ...ACCOUNT,
      email: "target-3@andaman.test",
      totpEnabledAt: new Date(),
    });
    compare.mockResolvedValue(true);
    consume.mockResolvedValue({ ok: false });

    await expect(
      authorize({ email: "target-3@andaman.test", password: "right", totp: "000000" }),
    ).rejects.toThrow();

    /*
      The distinction the whole feature turns on. "Someone guessed wrong"
      and "someone has a working password and is missing only the phone"
      are not the same event, and a single failed-login action would file
      them under the same heading.
    */
    expect(written()).toMatchObject({
      action: AUTH_TOTP_FAILED,
      actorId: ACCOUNT.id,
    });
    expect(isFailedAuth(AUTH_TOTP_FAILED)).toBe(true);
  });

  it("stops writing once the rate limiter takes over", async () => {
    findUnique.mockResolvedValue({ ...ACCOUNT, email: "hammered-4@andaman.test" });
    compare.mockResolvedValue(false);

    for (let attempt = 0; attempt < 14; attempt += 1) {
      await authorize({ email: "hammered-4@andaman.test", password: "wrong" });
    }

    /*
      The cap is the point. Attempts turned away at the limiter are not
      recorded, so an attacker cannot grow this table as fast as they can
      send requests — which would be a cheaper attack than the one the log
      exists to reveal. Ten rows say what is happening; the eleventh would
      add nothing and the ten-thousandth would be the problem.
    */
    expect(create.mock.calls.length).toBe(10);
  });

  it("bounds the address, which on this path is unvalidated input", async () => {
    findUnique.mockResolvedValue(null);
    compare.mockResolvedValue(false);

    const long = `${"a".repeat(500)}@example.com`;
    await authorize({ email: long, password: "guess" });

    expect(written().actorEmail.length).toBe(200);
  });
});

describe("isAuthEvent", () => {
  it("separates the two kinds of entry the page renders differently", () => {
    expect(isAuthEvent(AUTH_MODEL)).toBe(true);
    expect(isAuthEvent("Project")).toBe(false);
    expect(isAuthEvent("Faq")).toBe(false);
    // Not a Prisma model, so it cannot collide with one the extension logs.
    expect(AUTH_MODEL).not.toBe("User");
  });
});
