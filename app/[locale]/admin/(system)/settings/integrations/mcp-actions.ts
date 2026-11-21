"use server";

/**
 * Keys for the AI connection and the approvals it waits on
 * (lib/mcp/tokens.ts, lib/mcp/deletions.ts). ADMIN and above, like the rest
 * of this page.
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin/guard";
import { createApiToken, revokeApiToken } from "@/lib/mcp/tokens";
import { approveDeletion, rejectDeletion } from "@/lib/mcp/deletions";
import { approveRequest, denyRequest, OAuthError, revokeGrant } from "@/lib/mcp/oauth";
import "@/lib/mcp/tools";

export type McpActionResult =
  | { ok: true; token?: string; deleted?: number }
  | { ok: false; error: string; detail?: string };

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  userId: z.string().min(1).max(64),
  scope: z.enum(["read", "write"]),
  /** 0 = never. */
  expiresDays: z.number().int().min(0).max(3650),
});

async function admin(): Promise<string | null> {
  try {
    return (await requireAdminAction(Role.ADMIN)).id;
  } catch {
    return null;
  }
}

function refresh(locale: string) {
  revalidatePath(`/${locale}/admin/settings/integrations`);
}

export async function createMcpTokenAction(locale: string, input: unknown): Promise<McpActionResult> {
  const actorId = await admin();
  if (!actorId) return { ok: false, error: "FORBIDDEN" };
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  const { name, userId, scope, expiresDays } = parsed.data;

  try {
    const created = await createApiToken({
      name,
      userId,
      scope,
      expiresAt: expiresDays ? new Date(Date.now() + expiresDays * 24 * 60 * 60_000) : null,
      createdById: actorId,
    });
    if ("error" in created) return { ok: false, error: created.error };
    refresh(locale);
    return { ok: true, token: created.token };
  } catch (error) {
    console.error("[mcp-actions] create", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}

export async function revokeMcpTokenAction(locale: string, id: string): Promise<McpActionResult> {
  if (!(await admin())) return { ok: false, error: "FORBIDDEN" };
  if (typeof id !== "string" || !id) return { ok: false, error: "INVALID_INPUT" };
  await revokeApiToken(id);
  refresh(locale);
  return { ok: true };
}

export async function approveMcpDeletionAction(locale: string, id: string): Promise<McpActionResult> {
  const actorId = await admin();
  if (!actorId) return { ok: false, error: "FORBIDDEN" };
  if (typeof id !== "string" || !id) return { ok: false, error: "INVALID_INPUT" };
  const outcome = await approveDeletion(id, actorId);
  refresh(locale);
  // What was deleted may be on any page; the layout covers them all.
  if (outcome.ok) revalidatePath("/", "layout");
  return outcome.ok ? { ok: true, deleted: outcome.deleted } : { ok: false, error: outcome.error, detail: outcome.detail };
}

export async function rejectMcpDeletionAction(locale: string, id: string): Promise<McpActionResult> {
  const actorId = await admin();
  if (!actorId) return { ok: false, error: "FORBIDDEN" };
  if (typeof id !== "string" || !id) return { ok: false, error: "INVALID_INPUT" };
  await rejectDeletion(id, actorId);
  refresh(locale);
  return { ok: true };
}

/* ── OAuth: the consent screen and ending a connection ─────────────────── */

const consentSchema = z.object({
  requestId: z.string().min(1).max(64),
  botUserId: z.string().min(1).max(64),
  scope: z.enum(["read", "write"]),
});

export type ConsentResult = { ok: true; redirectTo: string } | { ok: false; error: string };

export async function approveOAuthRequestAction(input: unknown): Promise<ConsentResult> {
  const actorId = await admin();
  if (!actorId) return { ok: false, error: "FORBIDDEN" };
  const parsed = consentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };
  try {
    return { ok: true, redirectTo: await approveRequest({ ...parsed.data, approvedById: actorId }) };
  } catch (error) {
    if (error instanceof OAuthError) return { ok: false, error: error.message === "NOT_A_BOT" ? "NOT_A_BOT" : "EXPIRED" };
    console.error("[mcp-actions] approve oauth", error);
    return { ok: false, error: "SAVE_FAILED" };
  }
}

export async function denyOAuthRequestAction(requestId: string): Promise<ConsentResult> {
  if (!(await admin())) return { ok: false, error: "FORBIDDEN" };
  if (typeof requestId !== "string" || !requestId) return { ok: false, error: "INVALID_INPUT" };
  const redirectTo = await denyRequest(requestId);
  return redirectTo ? { ok: true, redirectTo } : { ok: false, error: "EXPIRED" };
}

export async function revokeOAuthGrantAction(locale: string, id: string): Promise<McpActionResult> {
  if (!(await admin())) return { ok: false, error: "FORBIDDEN" };
  if (typeof id !== "string" || !id) return { ok: false, error: "INVALID_INPUT" };
  await revokeGrant(id);
  refresh(locale);
  return { ok: true };
}
