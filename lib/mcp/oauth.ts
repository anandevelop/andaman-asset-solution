/**
 * lib/mcp/oauth.ts
 * ─────────────────────────────────────────────────────────────────────────
 * OAuth 2.1 for the AI connection, so it can be added as a connector that
 * signs in (Claude, ChatGPT) instead of being handed a key.
 *
 * This site is its own authorization server, and a small one:
 *
 *   WHO SIGNS IN    An administrator, in the back office, with their own
 *                   password and second factor. Nobody else can approve.
 *   WHAT THEY GRANT That the application may act as one Bot account, read
 *                   only or read and write. Never as the administrator: the
 *                   connection gets the Bot role's permissions and nothing
 *                   more, exactly like a key made by hand.
 *   WHAT IS ISSUED  A one-hour access token — an ordinary row in api_tokens,
 *                   so /api/mcp checks it the way it checks any key — and a
 *                   refresh token that is replaced every time it is used.
 *
 * CLIENTS are public (no secret). Two ways to be known here: registering
 * (RFC 7591), or using the https URL of a client metadata document as the
 * client id, which is fetched through lib/mcp/safe-fetch.ts because it is an
 * address a stranger chose. Either way the redirect URI of every request
 * must be one the client declared, exactly.
 *
 * PKCE (S256) is required. It is what ties the token request to whoever
 * started the sign-in, in place of a client secret.
 *
 * Everything secret is stored as a SHA-256: authorization codes, refresh
 * tokens and access tokens. All are long random values.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import crypto from "node:crypto";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withoutAudit } from "@/lib/audit/context";
import { hashToken, TOKEN_PREFIX } from "@/lib/mcp/tokens";
import { downloadPublicFile } from "@/lib/mcp/safe-fetch";

export const ACCESS_TOKEN_SECONDS = 60 * 60;
export const REFRESH_TOKEN_MS = 60 * 24 * 60 * 60_000;
export const REQUEST_MS = 15 * 60_000;
export const CODE_MS = 60_000;
export const SCOPES = ["read", "write"] as const;
export type OAuthScope = (typeof SCOPES)[number];

export function siteOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://andamanassetsolution.com").origin;
  } catch {
    return "https://andamanassetsolution.com";
  }
}

export const mcpResource = () => `${siteOrigin()}/api/mcp`;

export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [siteOrigin()],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "Andaman Asset Solution back office",
  };
}

export function authorizationServerMetadata() {
  const origin = siteOrigin();
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    scopes_supported: [...SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
  };
}

/** The 401 challenge /api/mcp sends, pointing a client at the metadata. */
export function bearerChallenge(error?: "invalid_token"): string {
  const parts = ['realm="mcp"', `resource_metadata="${siteOrigin()}/.well-known/oauth-protected-resource"`, 'scope="read write"'];
  if (error) parts.push(`error="${error}"`);
  return `Bearer ${parts.join(", ")}`;
}

export class OAuthError extends Error {
  constructor(
    public code: "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type" | "invalid_scope" | "invalid_target" | "invalid_client_metadata" | "invalid_redirect_uri" | "access_denied",
    description: string,
  ) {
    super(description);
  }
}

/** https anywhere, or http on the loopback (desktop and command-line clients). */
export function isAllowedRedirectUri(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2000) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/**
 * Exact match, with the one exception OAuth makes: a loopback redirect may
 * use any port, because a desktop client picks a free one each time.
 */
export function redirectUriMatches(registered: string[], given: string): boolean {
  if (registered.includes(given)) return true;
  let asked: URL;
  try {
    asked = new URL(given);
  } catch {
    return false;
  }
  if (asked.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(asked.hostname)) return false;
  return registered.some((entry) => {
    try {
      const known = new URL(entry);
      return known.protocol === "http:" && known.hostname === asked.hostname && known.pathname === asked.pathname && known.search === asked.search;
    } catch {
      return false;
    }
  });
}

function cleanName(value: unknown): string {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim() : "";
  return text.slice(0, 80) || "Unnamed application";
}

export type KnownClient = { clientId: string; name: string; redirectUris: string[] };

function shapeClient(row: { clientId: string; name: string; redirectUris: unknown }): KnownClient {
  return { clientId: row.clientId, name: row.name, redirectUris: Array.isArray(row.redirectUris) ? (row.redirectUris as string[]) : [] };
}

/** RFC 7591. Open by design — a registration grants nothing until a person approves a sign-in. */
export async function registerClient(body: unknown): Promise<KnownClient> {
  const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const uris = Array.isArray(input.redirect_uris) ? input.redirect_uris : [];
  if (uris.length === 0 || uris.length > 10 || !uris.every(isAllowedRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris must be 1–10 https URLs (http only on localhost).");
  }
  const method = input.token_endpoint_auth_method;
  if (method !== undefined && method !== "none") {
    throw new OAuthError("invalid_client_metadata", "Only public clients are supported: token_endpoint_auth_method must be \"none\".");
  }
  const row = await withoutAudit(async () =>
    await prisma.oAuthClient.create({
      data: { clientId: `mcp_${crypto.randomBytes(18).toString("base64url")}`, name: cleanName(input.client_name), redirectUris: uris as string[], kind: "registered" },
    }),
  );
  return shapeClient(row);
}

const METADATA_TTL_MS = 60 * 60_000;

async function clientFromMetadataDocument(clientId: string, now: Date): Promise<KnownClient> {
  const cached = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (cached && now.getTime() - cached.fetchedAt.getTime() < METADATA_TTL_MS) return shapeClient(cached);

  let document: Record<string, unknown>;
  try {
    const file = await downloadPublicFile(clientId, { maxBytes: 64 * 1024, timeoutMs: 8_000, accept: "application/json" });
    document = JSON.parse(file.body.toString("utf8"));
  } catch {
    // An unreachable document does not lock out a client we already know.
    if (cached) return shapeClient(cached);
    throw new OAuthError("invalid_client", "The client metadata document could not be fetched.");
  }
  if (document.client_id !== clientId) throw new OAuthError("invalid_client", "The client metadata document names a different client_id.");
  const uris = Array.isArray(document.redirect_uris) ? document.redirect_uris : [];
  if (uris.length === 0 || uris.length > 20 || !uris.every(isAllowedRedirectUri)) {
    throw new OAuthError("invalid_client", "The client metadata document has no usable redirect_uris.");
  }
  const data = { name: cleanName(document.client_name), redirectUris: uris as string[], kind: "metadata", fetchedAt: now };
  const row = await withoutAudit(async () =>
    await prisma.oAuthClient.upsert({ where: { clientId }, create: { clientId, ...data }, update: data }),
  );
  return shapeClient(row);
}

export async function findClient(clientId: string, now = new Date()): Promise<KnownClient> {
  if (!clientId || clientId.length > 2000) throw new OAuthError("invalid_client", "Unknown client.");
  if (/^https:\/\//.test(clientId)) return clientFromMetadataDocument(clientId, now);
  const row = await prisma.oAuthClient.findUnique({ where: { clientId } });
  if (!row) throw new OAuthError("invalid_client", "Unknown client. Register first, or use a client metadata document URL as client_id.");
  return shapeClient(row);
}

export function parseScope(raw: string | null): OAuthScope {
  const asked = (raw ?? "").split(/\s+/).filter(Boolean);
  // "write" includes reading; anything unrecognised is ignored rather than refused.
  return asked.includes("write") ? "write" : "read";
}

function resourceIsOurs(resource: string | null): boolean {
  if (!resource) return true;
  const given = resource.replace(/\/+$/, "");
  return given === mcpResource() || given === siteOrigin();
}

export type AuthorizeParams = {
  responseType: string | null;
  clientId: string | null;
  redirectUri: string | null;
  codeChallenge: string | null;
  codeChallengeMethod: string | null;
  state: string | null;
  scope: string | null;
  resource: string | null;
};

/**
 * First step of a sign-in. Validates everything that can be validated
 * before a person is involved and parks the request; the consent page
 * works from the stored row, so nothing shown to the administrator can be
 * altered by editing the address bar.
 *
 * Throws OAuthError with `redirectable` false semantics: a caller must NOT
 * redirect to redirect_uri for errors raised here before the client and
 * its redirect URI are verified — that is how open redirects are made.
 */
export async function beginAuthorization(params: AuthorizeParams, now = new Date()): Promise<{ requestId: string }> {
  const client = await findClient(params.clientId ?? "", now);
  if (!params.redirectUri || !redirectUriMatches(client.redirectUris, params.redirectUri)) {
    throw new OAuthError("invalid_request", "redirect_uri is not registered for this client.");
  }
  if (params.responseType !== "code") throw new OAuthError("invalid_request", "response_type must be \"code\".");
  if (params.codeChallengeMethod !== "S256" || !params.codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(params.codeChallenge)) {
    throw new OAuthError("invalid_request", "PKCE is required: code_challenge with code_challenge_method=S256.");
  }
  if (!resourceIsOurs(params.resource)) throw new OAuthError("invalid_target", "resource is not this server.");
  if (params.state && params.state.length > 2000) throw new OAuthError("invalid_request", "state is too long.");

  const row = await withoutAudit(async () =>
    await prisma.oAuthRequest.create({
      data: {
        clientId: client.clientId,
        clientName: client.name,
        redirectUri: params.redirectUri!,
        state: params.state,
        codeChallenge: params.codeChallenge!,
        scope: parseScope(params.scope),
        resource: params.resource,
        expiresAt: new Date(now.getTime() + REQUEST_MS),
      },
      select: { id: true },
    }),
  );
  return { requestId: row.id };
}

export type PendingRequest = { id: string; clientId: string; clientName: string; redirectUri: string; scope: OAuthScope };

/** What the consent page shows. Null once approved, denied or expired. */
export async function pendingRequest(id: string, now = new Date()): Promise<PendingRequest | null> {
  const row = await prisma.oAuthRequest.findUnique({ where: { id } });
  if (!row || row.codeHash || row.usedAt || row.expiresAt <= now) return null;
  return { id: row.id, clientId: row.clientId, clientName: row.clientName, redirectUri: row.redirectUri, scope: row.scope === "write" ? "write" : "read" };
}

function withParams(redirectUri: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  return url.toString();
}

/** An administrator said yes. Returns the address to send the browser back to. */
export async function approveRequest(input: { requestId: string; botUserId: string; scope: OAuthScope; approvedById: string }, now = new Date()): Promise<string> {
  const row = await prisma.oAuthRequest.findUnique({ where: { id: input.requestId } });
  if (!row || row.codeHash || row.usedAt || row.expiresAt <= now) throw new OAuthError("invalid_request", "This sign-in request has expired. Start again from the application.");

  const bot = await prisma.user.findUnique({ where: { id: input.botUserId }, select: { role: true, isActive: true } });
  if (!bot || !bot.isActive || bot.role !== Role.BOT) throw new OAuthError("invalid_request", "NOT_A_BOT");

  /* The administrator decides, not the application. Most applications ask
     for no scope at all, or only for what the 401 mentioned, and would
     otherwise be stuck read-only for good; and the person approving is the
     one with the authority to grant either. The token response states the
     scope actually granted, as OAuth requires when it differs from the
     one requested. */
  const scope: OAuthScope = input.scope === "write" ? "write" : "read";
  const code = crypto.randomBytes(32).toString("base64url");

  const grant = await prisma.oAuthGrant.create({
    data: { clientId: row.clientId, clientName: row.clientName, botUserId: input.botUserId, scope, approvedById: input.approvedById },
    select: { id: true },
  });
  const claimed = await withoutAudit(async () =>
    await prisma.oAuthRequest.updateMany({
      where: { id: row.id, codeHash: null, usedAt: null },
      data: { codeHash: hashToken(code), grantId: grant.id, scope, expiresAt: new Date(now.getTime() + CODE_MS) },
    }),
  );
  if (claimed.count === 0) throw new OAuthError("invalid_request", "This sign-in request was already answered.");

  return withParams(row.redirectUri, { code, state: row.state, iss: siteOrigin() });
}

/** An administrator said no. */
export async function denyRequest(requestId: string): Promise<string | null> {
  const row = await prisma.oAuthRequest.findUnique({ where: { id: requestId } });
  if (!row || row.codeHash || row.usedAt) return null;
  await withoutAudit(async () => await prisma.oAuthRequest.updateMany({ where: { id: requestId, codeHash: null }, data: { usedAt: new Date() } }));
  return withParams(row.redirectUri, { error: "access_denied", error_description: "The administrator declined.", state: row.state, iss: siteOrigin() });
}

export type TokenResponse = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: OAuthScope };

async function issueTokens(grantId: string, now: Date): Promise<TokenResponse> {
  const grant = await prisma.oAuthGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.revokedAt) throw new OAuthError("invalid_grant", "This connection was ended.");
  const bot = await prisma.user.findUnique({ where: { id: grant.botUserId }, select: { role: true, isActive: true } });
  if (!bot || !bot.isActive || bot.role !== Role.BOT) throw new OAuthError("invalid_grant", "The account behind this connection is no longer an active Bot account.");

  const access = TOKEN_PREFIX + crypto.randomBytes(32).toString("base64url");
  const refresh = `aasr_${crypto.randomBytes(32).toString("base64url")}`;
  const scope: OAuthScope = grant.scope === "write" ? "write" : "read";

  await withoutAudit(async () => {
    await prisma.apiToken.create({
      data: {
        name: grant.clientName,
        prefix: access.slice(0, TOKEN_PREFIX.length + 6),
        tokenHash: hashToken(access),
        scope,
        userId: grant.botUserId,
        createdById: grant.approvedById,
        oauthGrantId: grant.id,
        expiresAt: new Date(now.getTime() + ACCESS_TOKEN_SECONDS * 1000),
      },
    });
    await prisma.oAuthRefreshToken.create({ data: { tokenHash: hashToken(refresh), grantId: grant.id, expiresAt: new Date(now.getTime() + REFRESH_TOKEN_MS) } });
    await prisma.oAuthGrant.update({ where: { id: grant.id }, data: { lastUsedAt: now } });
  });

  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TOKEN_SECONDS, refresh_token: refresh, scope };
}

function challengeOf(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export async function exchangeCode(input: { code: string | null; codeVerifier: string | null; clientId: string | null; redirectUri: string | null; resource: string | null }, now = new Date()): Promise<TokenResponse> {
  if (!input.code || !input.codeVerifier) throw new OAuthError("invalid_request", "code and code_verifier are required.");
  if (!resourceIsOurs(input.resource)) throw new OAuthError("invalid_target", "resource is not this server.");

  const row = await prisma.oAuthRequest.findUnique({ where: { codeHash: hashToken(input.code) } });
  if (!row || !row.grantId) throw new OAuthError("invalid_grant", "Unknown authorization code.");

  // Used once. A second presentation means the code leaked: end the connection it made.
  const claimed = await withoutAudit(async () => await prisma.oAuthRequest.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } }));
  if (claimed.count === 0) {
    await revokeGrant(row.grantId);
    throw new OAuthError("invalid_grant", "This authorization code was already used.");
  }
  // The code is spent whatever happens next. If the exchange fails, the
  // connection it would have completed must not be left looking connected.
  const refuse = async (description: string): Promise<never> => {
    await revokeGrant(row.grantId!);
    throw new OAuthError("invalid_grant", description);
  };
  if (row.expiresAt <= now) await refuse("The authorization code has expired.");
  if (row.clientId !== input.clientId) await refuse("client_id does not match the authorization request.");
  if (row.redirectUri !== input.redirectUri) await refuse("redirect_uri does not match the authorization request.");
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(input.codeVerifier) || challengeOf(input.codeVerifier) !== row.codeChallenge) {
    await refuse("PKCE verification failed.");
  }
  return issueTokens(row.grantId, now);
}

export async function refreshTokens(input: { refreshToken: string | null; clientId: string | null }, now = new Date()): Promise<TokenResponse> {
  if (!input.refreshToken) throw new OAuthError("invalid_request", "refresh_token is required.");
  const row = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hashToken(input.refreshToken) } });
  if (!row) throw new OAuthError("invalid_grant", "Unknown refresh token.");
  const grant = await prisma.oAuthGrant.findUnique({ where: { id: row.grantId }, select: { clientId: true } });
  if (!grant || (input.clientId && grant.clientId !== input.clientId)) throw new OAuthError("invalid_grant", "This refresh token belongs to another client.");

  const claimed = await withoutAudit(async () => await prisma.oAuthRefreshToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } }));
  if (claimed.count === 0) {
    // Replay of a spent token: somebody else holds a copy.
    await revokeGrant(row.grantId);
    throw new OAuthError("invalid_grant", "This refresh token was already used; the connection has been ended.");
  }
  if (row.expiresAt <= now) throw new OAuthError("invalid_grant", "The refresh token has expired. Connect again.");
  return issueTokens(row.grantId, now);
}

/** Ends a connection and every token issued under it. */
export async function revokeGrant(grantId: string): Promise<boolean> {
  const now = new Date();
  const result = await prisma.oAuthGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { revokedAt: now } });
  await withoutAudit(async () => {
    await prisma.apiToken.updateMany({ where: { oauthGrantId: grantId, revokedAt: null }, data: { revokedAt: now } });
    await prisma.oAuthRefreshToken.updateMany({ where: { grantId, usedAt: null }, data: { usedAt: now } });
  });
  return result.count > 0;
}

/**
 * Changes what a connection may do, from Settings → Integrations. Applies
 * at once: the tokens it already holds are changed with it, so nobody has
 * to connect again.
 */
export async function setGrantScope(grantId: string, scope: OAuthScope): Promise<boolean> {
  const result = await prisma.oAuthGrant.updateMany({ where: { id: grantId, revokedAt: null }, data: { scope } });
  if (result.count === 0) return false;
  await withoutAudit(async () => await prisma.apiToken.updateMany({ where: { oauthGrantId: grantId, revokedAt: null }, data: { scope } }));
  return true;
}

/** RFC 7009: a client handing a token back. Always "succeeds". */
export async function revokeByToken(token: string | null): Promise<void> {
  if (!token) return;
  const hash = hashToken(token);
  const refresh = await prisma.oAuthRefreshToken.findUnique({ where: { tokenHash: hash }, select: { grantId: true } });
  if (refresh) return void (await revokeGrant(refresh.grantId));
  const access = await prisma.apiToken.findUnique({ where: { tokenHash: hash }, select: { oauthGrantId: true } });
  if (access?.oauthGrantId) await revokeGrant(access.oauthGrantId);
}

export type GrantRow = { id: string; clientName: string; clientId: string; botName: string; scope: string; createdAt: Date; lastUsedAt: Date | null };

export async function listGrants(): Promise<GrantRow[]> {
  const grants = await prisma.oAuthGrant.findMany({ where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
  const bots = await prisma.user.findMany({ where: { id: { in: grants.map((g) => g.botUserId) } }, select: { id: true, name: true } });
  const names = new Map(bots.map((b) => [b.id, b.name]));
  return grants.map((g) => ({ id: g.id, clientName: g.clientName, clientId: g.clientId, botName: names.get(g.botUserId) ?? "—", scope: g.scope, createdAt: g.createdAt, lastUsedAt: g.lastUsedAt }));
}

/** Housekeeping: what is expired and of no further use. Not called from an AI client's context. */
export async function pruneOAuth(now = new Date()): Promise<{ tokens: number; requests: number; refresh: number }> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000);
  return withoutAudit(async () => {
    const tokens = await prisma.apiToken.deleteMany({ where: { oauthGrantId: { not: null }, expiresAt: { lt: dayAgo } } });
    const requests = await prisma.oAuthRequest.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
    const refresh = await prisma.oAuthRefreshToken.deleteMany({ where: { expiresAt: { lt: dayAgo } } });
    return { tokens: tokens.count, requests: requests.count, refresh: refresh.count };
  });
}
