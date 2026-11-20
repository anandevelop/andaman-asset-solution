/**
 * tests/mcp-integration.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The deletion rule against a real database and the real Prisma client —
 * the one thing the mocked tests cannot show: that the guard in
 * lib/audit/extension.ts actually sits in front of a delete.
 *
 * Runs when E2E_DATABASE_URL is set (as tests/audit-integration.test.ts
 * does) and is skipped otherwise.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const DB_URL = process.env.E2E_DATABASE_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;

const TAG = "mcp-int-";

describe.skipIf(!DB_URL)("the AI connection against a real database", () => {
  let prisma: typeof import("@/lib/prisma")["prisma"];
  let mcp: typeof import("@/lib/mcp/context");
  let deletions: typeof import("@/lib/mcp/deletions");
  let tokens: typeof import("@/lib/mcp/tokens");
  let jobs: typeof import("@/lib/mcp/jobs");
  let actor: import("@/lib/mcp/context").McpActor;
  let adminId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/prisma"));
    mcp = await import("@/lib/mcp/context");
    deletions = await import("@/lib/mcp/deletions");
    tokens = await import("@/lib/mcp/tokens");
    jobs = await import("@/lib/mcp/jobs");

    const bot = await prisma.user.upsert({
      where: { email: `${TAG}bot@andaman.test` },
      update: { role: "BOT", isActive: true },
      create: { email: `${TAG}bot@andaman.test`, name: "MCP Integration Bot", role: "BOT", isActive: true },
    });
    const admin = await prisma.user.upsert({
      where: { email: `${TAG}admin@andaman.test` },
      update: {},
      create: { email: `${TAG}admin@andaman.test`, name: "MCP Integration Admin", role: "ADMIN", isActive: false },
    });
    adminId = admin.id;

    const created = await tokens.createApiToken({ name: `${TAG}key`, userId: bot.id, scope: "write", expiresAt: null, createdById: admin.id });
    if ("error" in created) throw new Error(created.error);
    const verified = await tokens.verifyApiToken(created.token, "127.0.0.1");
    if (!verified) throw new Error("key did not verify");
    actor = verified;

    deletions.registerDeletion("int.errors", {
      tier: "chat",
      run: async (ids) => (await prisma.systemError.deleteMany({ where: { id: { in: ids } } })).count,
    });
    deletions.registerDeletion("int.errors.human", {
      tier: "human",
      run: async (ids) => (await prisma.systemError.deleteMany({ where: { id: { in: ids } } })).count,
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.systemError.deleteMany({ where: { fingerprint: { startsWith: TAG } } });
    await prisma.backgroundJob.deleteMany({ where: { kind: { startsWith: TAG } } });
    await prisma.mcpDeletion.deleteMany({ where: { kind: { startsWith: "int." } } });
    await prisma.auditLog.deleteMany({ where: { actorEmail: { startsWith: TAG } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TAG } } });
  });

  const makeError = (n: string) =>
    prisma.systemError.create({ data: { fingerprint: `${TAG}${n}-${Date.now()}`, kind: "server", name: "Error", message: "m", place: "/x" } });

  it("a key verifies only while its account is an active bot", async () => {
    const created = await tokens.createApiToken({ name: `${TAG}temp`, userId: actor.userId, scope: "read", expiresAt: null, createdById: adminId });
    if ("error" in created) throw new Error(created.error);
    expect(await tokens.verifyApiToken(created.token, null)).toMatchObject({ scope: "read", role: "BOT" });
    expect(await tokens.verifyApiToken(created.token + "x", null)).toBeNull();
    expect(await tokens.verifyApiToken(created.token, null, new Date(Date.now() - 1))).not.toBeNull();

    await prisma.user.update({ where: { id: actor.userId }, data: { isActive: false } });
    expect(await tokens.verifyApiToken(created.token, null)).toBeNull();
    await prisma.user.update({ where: { id: actor.userId }, data: { isActive: true } });

    await tokens.revokeApiToken(created.id);
    expect(await tokens.verifyApiToken(created.token, null)).toBeNull();
    // A key cannot be made for an account that is not a bot.
    expect(await tokens.createApiToken({ name: "x", userId: adminId, scope: "read", expiresAt: null, createdById: adminId })).toEqual({ error: "NOT_A_BOT" });
  });

  it("a delete inside an AI client's call is refused by the database client itself", async () => {
    const row = await makeError("blocked");
    await expect(mcp.runAsMcp(actor, () => prisma.systemError.delete({ where: { id: row.id } }))).rejects.toThrow(mcp.MCP_DELETE_BLOCKED);
    await expect(mcp.runAsMcp(actor, () => prisma.systemError.deleteMany({ where: { id: row.id } }))).rejects.toThrow(mcp.MCP_DELETE_BLOCKED);
    expect(await prisma.systemError.findUnique({ where: { id: row.id } })).not.toBeNull();
    // The same client, outside such a call, deletes as it always did.
    await prisma.systemError.delete({ where: { id: row.id } });
    expect(await prisma.systemError.findUnique({ where: { id: row.id } })).toBeNull();
  });

  it("asking leaves the row; confirming with the code removes it", async () => {
    const row = await makeError("chat");
    const asked = await mcp.runAsMcp(actor, () => deletions.requestDeletion({ kind: "int.errors", ids: [row.id], summary: "one error" }));
    expect(asked.status).toBe("confirmation_required");
    expect(await prisma.systemError.findUnique({ where: { id: row.id } })).not.toBeNull();
    if (asked.status !== "confirmation_required") return;

    expect(await mcp.runAsMcp(actor, () => deletions.confirmDeletion(asked.requestId, asked.confirmationCode))).toEqual({ ok: true, deleted: 1 });
    expect(await prisma.systemError.findUnique({ where: { id: row.id } })).toBeNull();
    expect(await deletions.deletionStatus(asked.requestId, actor.tokenId)).toMatchObject({ status: "EXECUTED", count: 1 });
  });

  it("what needs a person waits for one", async () => {
    const row = await makeError("human");
    const asked = await mcp.runAsMcp(actor, () => deletions.requestDeletion({ kind: "int.errors.human", ids: [row.id], summary: "one error" }));
    expect(asked.status).toBe("approval_required");
    expect(await mcp.runAsMcp(actor, () => deletions.confirmDeletion(asked.requestId, "guess"))).toEqual({ ok: false, error: "WRONG_TIER" });
    expect((await deletions.pendingApprovals()).map((r) => r.id)).toContain(asked.requestId);
    expect(await prisma.systemError.findUnique({ where: { id: row.id } })).not.toBeNull();

    expect(await deletions.approveDeletion(asked.requestId, adminId)).toEqual({ ok: true, deleted: 1 });
    expect(await prisma.systemError.findUnique({ where: { id: row.id } })).toBeNull();
  });

  it("a queued job runs once, retries a failure, and reports to the key that queued it", async () => {
    const seen: unknown[] = [];
    jobs.registerJob(`${TAG}ok`, async (payload) => { seen.push(payload); return { stored: true }; });
    let attempts = 0;
    jobs.registerJob(`${TAG}flaky`, async () => { attempts++; throw new Error("upstream said no"); });

    const ok = await jobs.enqueueJob({ kind: `${TAG}ok`, payload: { url: "u" }, createdById: actor.userId, tokenId: actor.tokenId });
    const flaky = await jobs.enqueueJob({ kind: `${TAG}flaky`, payload: {}, tokenId: actor.tokenId, maxAttempts: 1 });
    if ("error" in ok || "error" in flaky) throw new Error("enqueue failed");
    expect(await jobs.enqueueJob({ kind: "no-such-kind", payload: {} })).toEqual({ error: "UNKNOWN_KIND" });

    // Two workers at once must not run the same job twice.
    const [a, b] = await Promise.all([jobs.runDueJobs(), jobs.runDueJobs()]);
    expect(a.done + b.done).toBeGreaterThanOrEqual(1);
    expect(seen).toEqual([{ url: "u" }]);
    expect(attempts).toBe(1);

    expect(await jobs.jobStatus(ok.id, actor.tokenId)).toMatchObject({ status: "DONE", result: { stored: true } });
    expect(await jobs.jobStatus(flaky.id, actor.tokenId)).toMatchObject({ status: "FAILED", error: "upstream said no" });
    expect(await jobs.jobStatus(ok.id, "another-key")).toBeNull();
  });
});
