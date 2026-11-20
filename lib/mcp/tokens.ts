/**
 * lib/mcp/tokens.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Keys for the AI connection (/api/mcp). Made and revoked at
 * /admin/settings/integrations.
 *
 * A key is `aas_` + 32 random bytes. It is returned once by createApiToken
 * and never stored: the table keeps its SHA-256, which is enough for a
 * value with that much entropy and means the database alone cannot be used
 * to call the API.
 *
 * A key is only as good as the account behind it. It works while that
 * account is active and its role is BOT; change either and every key the
 * account holds stops at the next call, with nothing to revoke.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import crypto from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withoutAudit } from "@/lib/audit/context";
import type { McpActor, McpScope } from "@/lib/mcp/context";

export const TOKEN_PREFIX = "aas_";
const LAST_USED_EVERY_MS = 60_000;

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isScope(value: unknown): value is McpScope {
  return value === "read" || value === "write";
}

export type CreatedToken = { id: string; token: string; prefix: string };

export async function createApiToken(input: {
  name: string;
  userId: string;
  scope: McpScope;
  expiresAt: Date | null;
  createdById: string;
}): Promise<CreatedToken | { error: "NOT_A_BOT" }> {
  const owner = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { role: true, isActive: true },
  });
  if (!owner || !owner.isActive || owner.role !== Role.BOT) return { error: "NOT_A_BOT" };

  const token = TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
  const prefix = token.slice(0, TOKEN_PREFIX.length + 6);
  const row = await prisma.apiToken.create({
    data: {
      name: input.name,
      prefix,
      tokenHash: hashToken(token),
      scope: input.scope,
      userId: input.userId,
      createdById: input.createdById,
      expiresAt: input.expiresAt,
    },
    select: { id: true },
  });
  return { id: row.id, token, prefix };
}

/** Marks the key unusable. Kept, not removed: the trail refers to it. */
export async function revokeApiToken(id: string): Promise<boolean> {
  const result = await prisma.apiToken.updateMany({
    where: { id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

export type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scope: string;
  userName: string;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

export async function listApiTokens(): Promise<TokenRow[]> {
  const rows = await prisma.apiToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      name: true,
      prefix: true,
      scope: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });
  return rows.map(({ user, ...row }) => ({ ...row, userName: user.name }));
}

/** Parses `Authorization: Bearer …`. */
export function bearerFrom(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return match ? match[1] : null;
}

/**
 * The account a key stands for, or null. Every reason for "no" looks the
 * same to the caller on purpose: a wrong key, a revoked one and one whose
 * account was demoted all get the same 401.
 */
export async function verifyApiToken(token: string | null, ip: string | null, now = new Date()): Promise<McpActor | null> {
  if (!token || !token.startsWith(TOKEN_PREFIX) || token.length > 200) return null;

  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      name: true,
      scope: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
    },
  });
  if (!row || row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt <= now) return null;
  if (!row.user.isActive || row.user.role !== Role.BOT) return null;
  if (!isScope(row.scope)) return null;

  // Bookkeeping, not an edit anybody made — and not on every call.
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
    await withoutAudit(async () =>
      await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: now, lastUsedIp: ip } }),
    ).catch(() => {});
  }

  return {
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    role: row.user.role,
    tokenId: row.id,
    tokenName: row.name,
    scope: row.scope,
  };
}
