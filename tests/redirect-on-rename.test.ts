/**
 * tests/redirect-on-rename.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The automatic 301 — the promise the URL screen's footer makes.
 *
 * Structural rather than against a database: what is worth pinning down is
 * *which writes* a rename issues, in what order, and that is exactly what
 * a fake client records. The three cases below are the ones that go wrong
 * in every implementation of this that does not think about them — a
 * rename that leaves a chain, a rename back to a previous name that leaves
 * a loop, and a write on a model whose slug is not part of any URL.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { redirectOnRename } from "@/lib/redirect-on-rename";

type Call = { op: string; args: unknown };

/** Records what a rename asks Prisma to do, without a database. */
function fakeClient() {
  const calls: Call[] = [];
  const record = (op: string) => vi.fn((args: unknown) => ({ op, args }));

  const client = {
    redirect: {
      deleteMany: record("redirect.deleteMany"),
      updateMany: record("redirect.updateMany"),
      upsert: record("redirect.upsert"),
    },
    notFoundHit: { deleteMany: record("notFoundHit.deleteMany") },
    $transaction: vi.fn(async (operations: Call[]) => {
      calls.push(...operations);
      return operations;
    }),
  } as unknown as PrismaClient;

  return { client, calls };
}

const find = (calls: Call[], op: string) => calls.find((call) => call.op === op)?.args as
  | Record<string, unknown>
  | undefined;

describe("redirectOnRename", () => {
  it("covers the old path with a 301 the system owns", async () => {
    const { client, calls } = fakeClient();

    await redirectOnRename(client, "Project", { slug: "old-name" }, { slug: "new-name" });

    const upsert = find(calls, "redirect.upsert");
    expect(upsert?.where).toEqual({ fromPath: "/projects/old-name" });
    expect(upsert?.create).toMatchObject({
      fromPath: "/projects/old-name",
      toPath: "/projects/new-name",
      statusCode: 301,
      source: "AUTO_SLUG",
    });
  });

  it("re-points earlier redirects instead of leaving a chain", async () => {
    const { client, calls } = fakeClient();

    // a → b happened before; now b → c.
    await redirectOnRename(client, "NewsArticle", { slug: "b" }, { slug: "c" });

    expect(find(calls, "redirect.updateMany")).toEqual({
      where: { toPath: "/news/b" },
      data: { toPath: "/news/c" },
    });
  });

  it("clears any redirect off the name being moved back onto", async () => {
    const { client, calls } = fakeClient();

    // Renamed a → b earlier, so /events/a redirects to /events/b. Renaming
    // back would otherwise leave /events/b pointing at a page that is now
    // /events/a — a redirect to a 404, or a loop.
    await redirectOnRename(client, "Event", { slug: "b" }, { slug: "a" });

    expect(find(calls, "redirect.deleteMany")).toEqual({ where: { fromPath: "/events/a" } });
  });

  it("takes the old path off the 404 worklist", async () => {
    const { client, calls } = fakeClient();

    await redirectOnRename(client, "EBrochure", { slug: "old" }, { slug: "new" });

    expect(find(calls, "notFoundHit.deleteMany")).toEqual({ where: { path: "/e-brochure/old" } });
  });

  it("does nothing for a model with no public URL", async () => {
    const { client, calls } = fakeClient();

    await redirectOnRename(client, "SiteSetting", { slug: "a" }, { slug: "b" });

    expect(calls).toEqual([]);
  });

  it("does nothing when the slug did not change", async () => {
    const { client, calls } = fakeClient();

    await redirectOnRename(client, "Project", { slug: "same", nameEn: "Before" }, { slug: "same", nameEn: "After" });

    expect(calls).toEqual([]);
  });

  it("does nothing on a create, where there is no prior row", async () => {
    const { client, calls } = fakeClient();

    await redirectOnRename(client, "Project", null, { slug: "brand-new" });

    expect(calls).toEqual([]);
  });

  it("never throws when the write fails", async () => {
    const { client } = fakeClient();
    (client.$transaction as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("connection lost"),
    );

    // A rename that already committed must not be reported as a failure
    // because its redirect could not be written.
    await expect(
      redirectOnRename(client, "Project", { slug: "old" }, { slug: "new" }),
    ).resolves.toBeUndefined();
  });
});
