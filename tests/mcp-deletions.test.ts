/**
 * tests/mcp-deletions.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rule the AI connection is built around: nothing is deleted by the
 * call that asks. Proven here at the two places it is enforced — the
 * request/confirm bookkeeping (lib/mcp/deletions.ts) and the guard every
 * Prisma delete passes through (lib/mcp/context.ts).
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/context", () => ({ withoutAudit: <T>(fn: () => T) => fn() }));

type Row = Record<string, unknown> & { id: string; status: string };
const rows = new Map<string, Row>();
let seq = 0;
const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([k, v]) => row[k] === v);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mcpDeletion: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `del${++seq}`, status: "PENDING", decidedAt: null, error: null, createdAt: new Date(), ...data } as Row;
        rows.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      findFirst: async ({ where }: { where: Record<string, unknown> }) => [...rows.values()].find((r) => matches(r, where)) ?? null,
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = [...rows.values()].filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => Object.assign(rows.get(where.id)!, data),
    },
  },
}));

import { Role } from "@prisma/client";
import { assertMcpMayDelete, MCP_DELETE_BLOCKED, runAsMcp, type McpActor } from "@/lib/mcp/context";
import { approveDeletion, CHAT_CONFIRM_MS, confirmDeletion, deletionStatus, registerDeletion, rejectDeletion, requestDeletion } from "@/lib/mcp/deletions";

const bot: McpActor = { userId: "u-bot", name: "Bot", email: "bot@test", role: Role.BOT, tokenId: "tok1", tokenName: "k", scope: "write" };
const otherKey: McpActor = { ...bot, tokenId: "tok2" };

/** Stands in for a Prisma delete: passes the guard or throws, like the real one. */
const removed: string[] = [];
const run = vi.fn(async (ids: string[]) => {
  assertMcpMayDelete("Media", "deleteMany");
  removed.push(...ids);
  return ids.length;
});

beforeEach(() => {
  rows.clear();
  removed.length = 0;
  run.mockClear();
  registerDeletion("test.small", { tier: "chat", run });
  registerDeletion("test.big", { tier: "human", run });
});

describe("the guard on every delete", () => {
  it("lets ordinary requests delete — only the AI connection is held", () => {
    expect(() => assertMcpMayDelete("Media", "delete")).not.toThrow();
  });

  it("refuses a delete made inside an AI client's call", async () => {
    await runAsMcp(bot, () => {
      expect(() => assertMcpMayDelete("Media", "delete")).toThrow(MCP_DELETE_BLOCKED);
      expect(() => assertMcpMayDelete("Project", "deleteMany")).toThrow(MCP_DELETE_BLOCKED);
    });
  });

  it("does not mistake an edit for a deletion", async () => {
    await runAsMcp(bot, () => {
      // Saving a record rewrites its translations.
      expect(() => assertMcpMayDelete("ProjectTranslation", "deleteMany")).not.toThrow();
      expect(() => assertMcpMayDelete("Project", "update")).not.toThrow();
      expect(() => assertMcpMayDelete("Project", "updateMany")).not.toThrow();
    });
  });
});

describe("asking to delete", () => {
  it("deletes nothing and hands back a code for the small tier", async () => {
    const answer = await runAsMcp(bot, () => requestDeletion({ kind: "test.small", ids: ["a", "b", "a"], summary: "2 unused images" }));
    expect(answer.status).toBe("confirmation_required");
    expect(run).not.toHaveBeenCalled();
    expect(removed).toEqual([]);
    expect(answer.instruction).toMatch(/NOTHING HAS BEEN DELETED/);
    const stored = rows.get(answer.requestId)!;
    expect(stored.targetIds).toEqual(["a", "b"]);
    // The code itself is not kept, only its hash.
    if (answer.status === "confirmation_required") expect(JSON.stringify(stored)).not.toContain(answer.confirmationCode);
  });

  it("issues no code at all for the tier a person must approve", async () => {
    const announce = vi.fn(async () => {});
    const answer = await runAsMcp(bot, () => requestDeletion({ kind: "test.big", ids: ["p1"], summary: "Project X", onHumanRequest: announce }));
    expect(answer.status).toBe("approval_required");
    expect(answer).not.toHaveProperty("confirmationCode");
    expect(rows.get(answer.requestId)!.codeHash).toBeNull();
    expect(announce).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses an unregistered kind, an empty list and an oversized one", async () => {
    await expect(runAsMcp(bot, () => requestDeletion({ kind: "nope", ids: ["a"], summary: "" }))).rejects.toThrow();
    await expect(runAsMcp(bot, () => requestDeletion({ kind: "test.small", ids: [], summary: "" }))).rejects.toThrow("NOTHING_TO_DELETE");
    const many = Array.from({ length: 201 }, (_, i) => `id${i}`);
    await expect(runAsMcp(bot, () => requestDeletion({ kind: "test.small", ids: many, summary: "" }))).rejects.toThrow("TOO_MANY_TARGETS");
  });
});

describe("confirming in the conversation", () => {
  async function ask() {
    const answer = await runAsMcp(bot, () => requestDeletion({ kind: "test.small", ids: ["a", "b"], summary: "two" }));
    if (answer.status !== "confirmation_required") throw new Error("expected a code");
    return answer;
  }

  it("deletes exactly what was asked, once", async () => {
    const { requestId, confirmationCode } = await ask();
    expect(await runAsMcp(bot, () => confirmDeletion(requestId, confirmationCode))).toEqual({ ok: true, deleted: 2 });
    expect(removed).toEqual(["a", "b"]);
    // The same code a second time does nothing.
    expect(await runAsMcp(bot, () => confirmDeletion(requestId, confirmationCode))).toEqual({ ok: false, error: "NOT_PENDING" });
    expect(removed).toEqual(["a", "b"]);
  });

  it("spends the request on a wrong code", async () => {
    const { requestId, confirmationCode } = await ask();
    expect(await runAsMcp(bot, () => confirmDeletion(requestId, "guess"))).toEqual({ ok: false, error: "WRONG_CODE" });
    expect(await runAsMcp(bot, () => confirmDeletion(requestId, confirmationCode))).toEqual({ ok: false, error: "NOT_PENDING" });
    expect(removed).toEqual([]);
  });

  it("expires after five minutes", async () => {
    const { requestId, confirmationCode } = await ask();
    const late = new Date(Date.now() + CHAT_CONFIRM_MS + 1000);
    expect(await runAsMcp(bot, () => confirmDeletion(requestId, confirmationCode, late))).toEqual({ ok: false, error: "EXPIRED" });
    expect(removed).toEqual([]);
  });

  it("is invisible to another key", async () => {
    const { requestId, confirmationCode } = await ask();
    expect(await runAsMcp(otherKey, () => confirmDeletion(requestId, confirmationCode))).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(await deletionStatus(requestId, otherKey.tokenId)).toBeNull();
    expect(removed).toEqual([]);
  });

  it("cannot confirm what only a person may approve", async () => {
    const answer = await runAsMcp(bot, () => requestDeletion({ kind: "test.big", ids: ["p1"], summary: "Project X" }));
    expect(await runAsMcp(bot, () => confirmDeletion(answer.requestId, "anything"))).toEqual({ ok: false, error: "WRONG_TIER" });
    expect(removed).toEqual([]);
  });
});

describe("a person deciding", () => {
  it("approval runs the deletion; a second approval does not", async () => {
    const answer = await runAsMcp(bot, () => requestDeletion({ kind: "test.big", ids: ["p1"], summary: "Project X" }));
    expect(await approveDeletion(answer.requestId, "admin1")).toEqual({ ok: true, deleted: 1 });
    expect(removed).toEqual(["p1"]);
    expect(rows.get(answer.requestId)).toMatchObject({ status: "EXECUTED", decidedById: "admin1" });
    expect(await approveDeletion(answer.requestId, "admin1")).toEqual({ ok: false, error: "NOT_PENDING" });
  });

  it("rejection leaves everything in place", async () => {
    const answer = await runAsMcp(bot, () => requestDeletion({ kind: "test.big", ids: ["p1"], summary: "Project X" }));
    expect(await rejectDeletion(answer.requestId, "admin1")).toBe(true);
    expect(await approveDeletion(answer.requestId, "admin1")).toEqual({ ok: false, error: "NOT_PENDING" });
    expect(removed).toEqual([]);
  });

  it("records a deletion that failed instead of calling it done", async () => {
    registerDeletion("test.broken", { tier: "human", run: async () => { throw new Error("row is referenced"); } });
    const answer = await runAsMcp(bot, () => requestDeletion({ kind: "test.broken", ids: ["p1"], summary: "x" }));
    expect(await approveDeletion(answer.requestId, "admin1")).toMatchObject({ ok: false, error: "FAILED", detail: "row is referenced" });
    expect(rows.get(answer.requestId)).toMatchObject({ status: "FAILED" });
  });
});
