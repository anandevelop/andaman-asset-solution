/**
 * tests/admin/user-sales-link.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Tying an account to a SalesPerson profile — the write half of the link
 * `lib/lead-routing.ts` has always read.
 *
 * The column and its unique constraint shipped with the sales-team screen,
 * and that screen spent the whole time telling admins to "link an account
 * on the users page" while nothing anywhere wrote the field. So the first
 * thing asserted here is simply that the value reaches Prisma at all.
 *
 * The rest is about the unique constraint, which is the only part with a
 * wrong answer available. One profile belongs to at most one account, so
 * the second admin to pick it has to be told which field was the problem —
 * and told the truth about it. Both columns on User are unique now, and
 * before this the P2002 handler reported EMAIL_TAKEN for either, which on
 * the create form meant "that email address already has an account" about
 * an email address nobody else had.
 *
 * Prisma is mocked because the questions here are all of the form "which
 * row did it try to write, and what did it do when the write came back
 * rejected" — see tests/news-autosave.test.ts, same approach.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma, Role } from "@prisma/client";

const { requireAdminAction } = vi.hoisted(() => ({ requireAdminAction: vi.fn() }));
vi.mock("@/lib/admin/guard", () => ({ requireAdminAction }));

const prismaMock = vi.hoisted(() => ({
  user: {
    create: vi.fn(),
    update: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
  },
  salesPerson: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

// Cost-12 hashing is ~250ms a call and proves nothing here.
vi.mock("bcryptjs", () => ({ default: { hash: async () => "hashed", compare: async () => true } }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/two-factor", () => ({ clearTwoFactor: vi.fn() }));

const { createUser, updateUser } = await import(
  "@/app/[locale]/admin/(system)/users/actions"
);

const ACTOR = { id: "actor-1", email: "boss@andaman.test", role: Role.SUPER_ADMIN };

/** A profile nobody holds — the ordinary case. */
const UNCLAIMED = { staffAccount: null };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const CREATE_FIELDS = {
  name: "Nok Saelim",
  email: "nok@andaman.test",
  role: Role.SALES,
  password: "a-long-enough-passphrase",
  isActive: "on",
};

const UPDATE_FIELDS = {
  name: "Nok Saelim",
  email: "nok@andaman.test",
  role: Role.SALES,
  isActive: "on",
};

/** The P2002 Prisma raises for a duplicate value in `column`. */
function uniqueViolation(column: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: [column] },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAction.mockResolvedValue(ACTOR);
  prismaMock.user.create.mockResolvedValue({ id: "user-1" });
  prismaMock.user.update.mockResolvedValue({ id: "user-1" });
  prismaMock.user.count.mockResolvedValue(1);
  prismaMock.salesPerson.findUnique.mockResolvedValue(UNCLAIMED);
  prismaMock.user.findUnique.mockResolvedValue({ role: Role.SALES, isActive: true });
});

describe("createUser", () => {
  it("writes the chosen profile to User.salesPersonId", async () => {
    const result = await createUser(
      "en",
      { ok: false },
      form({ ...CREATE_FIELDS, salesPersonId: "sp-1" }),
    );

    expect(result.ok).toBe(true);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ salesPersonId: "sp-1" }),
      }),
    );
  });

  it("stores no link at all when the field comes back empty", async () => {
    await createUser("en", { ok: false }, form({ ...CREATE_FIELDS, salesPersonId: "" }));

    const { data } = prismaMock.user.create.mock.calls[0][0];
    // null, not "" — an empty string is a foreign key matching nothing.
    expect(data.salesPersonId).toBeNull();
  });

  it("refuses a profile another account already holds, naming the field", async () => {
    prismaMock.salesPerson.findUnique.mockResolvedValue({
      staffAccount: { id: "someone-else" },
    });

    const result = await createUser(
      "en",
      { ok: false },
      form({ ...CREATE_FIELDS, salesPersonId: "sp-1" }),
    );

    expect(result).toEqual({
      ok: false,
      fields: { salesPersonId: "SALES_PERSON_TAKEN" },
    });
    // Refused before the write, so no half-made account is left behind.
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("refuses a profile that does not exist", async () => {
    prismaMock.salesPerson.findUnique.mockResolvedValue(null);

    const result = await createUser(
      "en",
      { ok: false },
      form({ ...CREATE_FIELDS, salesPersonId: "sp-gone" }),
    );

    expect(result.message).toBe("NOT_FOUND");
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("does not look up a profile when none was chosen", async () => {
    await createUser("en", { ok: false }, form({ ...CREATE_FIELDS, salesPersonId: "" }));
    expect(prismaMock.salesPerson.findUnique).not.toHaveBeenCalled();
  });
});

describe("the unique constraint reached as a P2002", () => {
  /*
    The pre-check above loses a race with a second admin submitting the same
    profile, so the database has the final say — and its answer has to come
    back as the same field error rather than a bare SAVE_FAILED.
  */
  it("reports a duplicate salesPersonId against that field, not the email", async () => {
    prismaMock.user.create.mockRejectedValue(uniqueViolation("salesPersonId"));

    const result = await createUser(
      "en",
      { ok: false },
      form({ ...CREATE_FIELDS, salesPersonId: "sp-1" }),
    );

    expect(result).toEqual({
      ok: false,
      fields: { salesPersonId: "SALES_PERSON_TAKEN" },
    });
  });

  it("still reports a duplicate email against the email field", async () => {
    prismaMock.user.create.mockRejectedValue(uniqueViolation("email"));

    const result = await createUser(
      "en",
      { ok: false },
      form({ ...CREATE_FIELDS, salesPersonId: "" }),
    );

    expect(result).toEqual({ ok: false, fields: { email: "EMAIL_TAKEN" } });
  });

  it("reports anything that is not a unique violation as a failed save", async () => {
    prismaMock.user.create.mockRejectedValue(new Error("connection reset"));

    const result = await createUser(
      "en",
      { ok: false },
      form({ ...CREATE_FIELDS, salesPersonId: "" }),
    );

    expect(result).toEqual({ ok: false, message: "SAVE_FAILED" });
  });
});

describe("updateUser", () => {
  it("links a profile to an existing account", async () => {
    const result = await updateUser(
      "en",
      "user-1",
      { ok: false },
      form({ ...UPDATE_FIELDS, salesPersonId: "sp-1" }),
    );

    expect(result.ok).toBe(true);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({ salesPersonId: "sp-1" }),
      }),
    );
  });

  it("unlinks when the field comes back empty", async () => {
    await updateUser(
      "en",
      "user-1",
      { ok: false },
      form({ ...UPDATE_FIELDS, salesPersonId: "" }),
    );

    const { data } = prismaMock.user.update.mock.calls[0][0];
    expect(data.salesPersonId).toBeNull();
  });

  it("does not treat the account's own existing link as a conflict", async () => {
    // Re-saving a linked user after editing their name: the profile is held,
    // but held by them.
    prismaMock.salesPerson.findUnique.mockResolvedValue({
      staffAccount: { id: "user-1" },
    });

    const result = await updateUser(
      "en",
      "user-1",
      { ok: false },
      form({ ...UPDATE_FIELDS, salesPersonId: "sp-1" }),
    );

    expect(result.ok).toBe(true);
  });

  it("refuses a profile a different account holds", async () => {
    prismaMock.salesPerson.findUnique.mockResolvedValue({
      staffAccount: { id: "user-2" },
    });

    const result = await updateUser(
      "en",
      "user-1",
      { ok: false },
      form({ ...UPDATE_FIELDS, salesPersonId: "sp-1" }),
    );

    expect(result).toEqual({
      ok: false,
      fields: { salesPersonId: "SALES_PERSON_TAKEN" },
    });
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});

describe("the invariants this file must not have loosened", () => {
  it("still refuses to let an actor demote themselves", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      isActive: true,
    });

    const result = await updateUser(
      "en",
      ACTOR.id,
      { ok: false },
      form({ ...UPDATE_FIELDS, role: Role.SALES, salesPersonId: "sp-1" }),
    );

    expect(result.message).toBe("CANNOT_DEMOTE_SELF");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("still refuses to strip the last active super admin", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      isActive: true,
    });
    prismaMock.user.count.mockResolvedValue(0); // nobody else left

    const result = await updateUser(
      "en",
      "other-super-admin",
      { ok: false },
      form({ ...UPDATE_FIELDS, role: Role.ADMIN, salesPersonId: "" }),
    );

    expect(result.message).toBe("LAST_SUPER_ADMIN");
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("reports a blocked demotion ahead of a profile conflict", async () => {
    /*
      Both are wrong with the same submission. The demotion is the one that
      would lock the team out, so it is the one to say — and the profile
      lookup should not even have run.
    */
    prismaMock.user.findUnique.mockResolvedValue({
      role: Role.SUPER_ADMIN,
      isActive: true,
    });
    prismaMock.salesPerson.findUnique.mockResolvedValue({
      staffAccount: { id: "user-2" },
    });

    const result = await updateUser(
      "en",
      ACTOR.id,
      { ok: false },
      form({ ...UPDATE_FIELDS, role: Role.SALES, salesPersonId: "sp-1" }),
    );

    expect(result.message).toBe("CANNOT_DEMOTE_SELF");
    expect(prismaMock.salesPerson.findUnique).not.toHaveBeenCalled();
  });

  it("is SUPER_ADMIN-only, like every other action in the file", async () => {
    requireAdminAction.mockRejectedValue(new Error("UNAUTHORISED"));

    await expect(
      createUser("en", { ok: false }, form({ ...CREATE_FIELDS, salesPersonId: "sp-1" })),
    ).rejects.toThrow("UNAUTHORISED");

    expect(requireAdminAction).toHaveBeenCalledWith(Role.SUPER_ADMIN);
  });
});
