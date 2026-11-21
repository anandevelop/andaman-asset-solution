/**
 * lib/mcp/context.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Who an MCP tool call is running as, carried through the call the same way
 * the audit actor is (lib/audit/context.ts): an AsyncLocalStorage pinned to
 * globalThis, because this file is bundled more than once.
 *
 * Two things read it.
 *
 * lib/admin/guard.ts — so a tool can call the very server action the back
 * office calls. Inside a tool there is no browser session; the guard takes
 * the bot's identity from here instead and then applies exactly the checks
 * it applies to a person. One set of rules, not a second copy for the AI.
 *
 * lib/audit/extension.ts — the deletion rule. While this context is set,
 * every Prisma delete is refused unless `deletionGranted` is true, and only
 * lib/mcp/deletions.ts sets that, after a confirmation. A tool that forgets
 * to ask cannot delete; it throws.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@prisma/client";

export type McpScope = "read" | "write";

export type McpActor = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  tokenId: string;
  tokenName: string;
  scope: McpScope;
};

type McpStore = { actor: McpActor; deletionGranted: boolean };

const globalForMcp = globalThis as unknown as { mcpStorage?: AsyncLocalStorage<McpStore | undefined> };
const storage = (globalForMcp.mcpStorage ??= new AsyncLocalStorage<McpStore | undefined>());

/**
 * Awaits inside the context, and that is the point. A Prisma call returns a
 * lazy promise: the query is sent when it is awaited, not when it is made.
 * Returned un-awaited from a plain `storage.run`, it would execute after the
 * context had ended — and the delete guard would see an ordinary request.
 * (tests/mcp-integration.test.ts found exactly that.)
 */
export function runAsMcp<T>(actor: McpActor, fn: () => T | Promise<T>): Promise<T> {
  return storage.run({ actor, deletionGranted: false }, async () => await fn());
}

export function getMcpActor(): McpActor | undefined {
  return storage.getStore()?.actor;
}

/** Only lib/mcp/deletions.ts calls this, around a confirmed deletion. */
export async function withDeletionGrant<T>(fn: () => T | Promise<T>): Promise<T> {
  const store = storage.getStore();
  if (!store) return await fn();
  return storage.run({ ...store, deletionGranted: true }, async () => await fn());
}

/**
 * Models whose rows are rewritten as part of saving their parent: an update
 * replaces a project's translations by deleting and re-creating them. That
 * is an edit, not a deletion anybody would be asked to confirm.
 *
 * SiteCopy is here for the same reason from the other direction: a row is
 * the team's wording for one line of the site, and saving the built-in
 * wording again removes the row. The line is still on the page; it reads
 * as it did before anyone changed it.
 */
const REWRITTEN_ON_SAVE = /Translation$|^SiteCopy$/;

export const MCP_DELETE_BLOCKED = "MCP_DELETE_NOT_CONFIRMED";

/** Throws when an AI client's call reaches a delete it has not confirmed. */
export function assertMcpMayDelete(model: string | undefined, operation: string): void {
  if (operation !== "delete" && operation !== "deleteMany") return;
  const store = storage.getStore();
  if (!store || store.deletionGranted) return;
  if (model && REWRITTEN_ON_SAVE.test(model)) return;
  throw new Error(`${MCP_DELETE_BLOCKED}:${model ?? "unknown"}`);
}
