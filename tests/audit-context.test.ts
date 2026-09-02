/**
 * tests/audit-context.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * That the actor the guard establishes is still there when the write runs.
 *
 * tests/audit.test.ts covers what the trail decides to record, and
 * tests/audit-integration.test.ts covers that the extension is attached to
 * the client the application imports. Both passed while the feature did not
 * work at all: every back-office change went unrecorded, because the actor
 * never reached the extension. Neither suite could see it, because both set
 * the actor themselves, in the same async context and from the same module
 * instance as the write.
 *
 * The hole was the joint between them — the guard's await, and Next's habit
 * of bundling a module more than once — so this file tests the joint. It
 * drives the real requireAdminAction() from something shaped like a server
 * action, and reads the actor back the way the Prisma extension does.
 *
 * The failure being guarded against is silence: no exception, no log line,
 * just an empty table that reads as "nobody did this".
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAuditActor, setAuditActor, withoutAudit } from "@/lib/audit/context";

type FakeSession = {
  user: {
    id: string;
    email: string;
    name: string;
    role: "SUPER_ADMIN" | "ADMIN" | "EDITOR";
    twoFactorPending: boolean;
  };
} | null;

/*
  Sessions are handed out one per call rather than held in a single
  variable, so the concurrency test below can give two overlapping requests
  two different people. `getServerSession` awaits before answering because
  the real one does — a database round trip and a bcrypt compare — and that
  await is precisely the boundary this file exists to test.
*/
let sessionQueue: FakeSession[] = [];

vi.mock("next-auth", () => ({
  getServerSession: async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
    return sessionQueue.shift() ?? null;
  },
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
  // Every case here either passes authorisation or fails on a missing
  // session, so the role comparison is never the thing under test.
  hasRole: () => true,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

const ADMIN: FakeSession = {
  user: {
    id: "user-1",
    email: "super@andaman.test",
    name: "Super Admin",
    role: "SUPER_ADMIN",
    twoFactorPending: false,
  },
};

const OTHER: FakeSession = {
  user: {
    id: "user-2",
    email: "editor@andaman.test",
    name: "Editor",
    role: "EDITOR",
    twoFactorPending: false,
  },
};

/**
 * What the Prisma extension does: reads the actor from a nested async call,
 * one or more awaits below the action that opened the scope.
 */
async function readActorLikeTheExtension() {
  await Promise.resolve();
  return getAuditActor();
}

beforeEach(() => {
  sessionQueue = [];
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the actor, across the guard's await", () => {
  it("is visible to a write the action makes after awaiting the guard", async () => {
    const { requireAdminAction } = await import("@/lib/admin/guard");
    sessionQueue = [ADMIN];

    // The shape of every server action in the back office.
    async function serverAction() {
      await requireAdminAction();
      return readActorLikeTheExtension();
    }

    /*
      This is the assertion the feature shipped without. The guard sets the
      actor after `await getServerSession()`, which is a context the caller
      has already left — so before beginAuditScope() this returned
      undefined, shouldAudit() returned false, and every administrator
      change was recorded as nothing, with nothing raised anywhere.
    */
    expect(await serverAction()).toEqual({
      id: "user-1",
      email: "super@andaman.test",
      role: "SUPER_ADMIN",
    });
  });

  it("is visible to a page that writes after awaiting the page guard", async () => {
    const { requireAdmin } = await import("@/lib/admin/guard");
    sessionQueue = [ADMIN];

    async function page() {
      await requireAdmin("en");
      return readActorLikeTheExtension();
    }

    // The page guard matters as much as the action guard: the 2FA setup
    // page mints a secret, which is a write by a named person.
    expect(await page()).toMatchObject({ id: "user-1" });
  });

  it("is absent after a guard that rejected the request", async () => {
    const { requireAdminAction } = await import("@/lib/admin/guard");
    sessionQueue = [null];

    async function serverAction() {
      await expect(requireAdminAction()).rejects.toThrow("UNAUTHORISED");
      return readActorLikeTheExtension();
    }

    // A request that was thrown out has not done anything worth recording,
    // and must not be able to attribute a later write to anyone.
    expect(await serverAction()).toBeUndefined();
  });

  it("does not leak between two requests running at once", async () => {
    const { requireAdminAction } = await import("@/lib/admin/guard");
    sessionQueue = [ADMIN, OTHER];

    async function serverAction() {
      await requireAdminAction();
      return (await readActorLikeTheExtension())?.email;
    }

    // enterWith mutates the current async context, so overlapping requests
    // sharing one store is the failure worth being sure about: it would
    // sign one administrator's changes with another's name.
    const [first, second] = await Promise.all([serverAction(), serverAction()]);

    expect(first).toBe("super@andaman.test");
    expect(second).toBe("editor@andaman.test");
  });

  it("is hidden inside withoutAudit, so the trail cannot log itself", async () => {
    const { requireAdminAction } = await import("@/lib/admin/guard");
    sessionQueue = [ADMIN];

    async function serverAction() {
      await requireAdminAction();
      const inside = await withoutAudit(() => readActorLikeTheExtension());
      const after = await readActorLikeTheExtension();
      return { inside, after };
    }

    const { inside, after } = await serverAction();

    expect(inside).toBeUndefined();
    // And the scope survives the excursion — the audit insert is not the
    // end of the request.
    expect(after).toMatchObject({ id: "user-1" });
  });
});

describe("the store, across duplicate module instances", () => {
  it("is shared by every copy of this module Next bundles", async () => {
    /*
      Next bundles server code per entry, so lib/audit/context.ts is
      constructed once per bundle that reaches it — fourteen times in one
      dev server, when this was measured. A module-level
      `new AsyncLocalStorage()` therefore gives the guards one store and
      the Prisma extension another, and every read comes back empty with
      nothing raised.

      vi.resetModules() reproduces that: the second import re-evaluates the
      file and yields genuinely different function objects, exactly as a
      second bundle would.
    */
    const first = await import("@/lib/audit/context");
    vi.resetModules();
    const second = await import("@/lib/audit/context");

    expect(second.setAuditActor).not.toBe(first.setAuditActor);

    first.setAuditActor({ id: "user-9", email: "pinned@andaman.test", role: "ADMIN" });

    // Written through one instance, read through the other — which is what
    // a guard and the extension are to each other.
    expect(second.getAuditActor()).toEqual({
      id: "user-9",
      email: "pinned@andaman.test",
      role: "ADMIN",
    });
  });
});

describe("setAuditActor outside a guard", () => {
  it("opens a scope of its own when there is none", async () => {
    // What a script or a test gets. The guards must not depend on it: a
    // scope opened here is opened below their awaits.
    setAuditActor({ id: "user-3", email: "direct@andaman.test", role: "ADMIN" });

    expect(await readActorLikeTheExtension()).toMatchObject({ id: "user-3" });
  });
});
