/**
 * POST /api/oauth/token — a one-time code, or a refresh token, for tokens.
 * Public clients: no secret, PKCE on the code. See lib/mcp/oauth.ts.
 */
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { exchangeCode, OAuthError, refreshTokens } from "@/lib/mcp/oauth";
import { oauthFailure, oauthJson, preflight, readBody } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = rateLimit(`oauth:token:${clientIp(request.headers)}`, { limit: 60, windowMs: 10 * 60_000 });
  if (!limit.ok) return oauthJson({ error: "temporarily_unavailable" }, 429, { "Retry-After": String(limit.retryAfter) });

  try {
    const body = await readBody(request);
    if (body.grant_type === "authorization_code") {
      return oauthJson(
        await exchangeCode({
          code: body.code ?? null,
          codeVerifier: body.code_verifier ?? null,
          clientId: body.client_id ?? null,
          redirectUri: body.redirect_uri ?? null,
          resource: body.resource ?? null,
        }),
      );
    }
    if (body.grant_type === "refresh_token") {
      return oauthJson(await refreshTokens({ refreshToken: body.refresh_token ?? null, clientId: body.client_id ?? null }));
    }
    throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  } catch (error) {
    return oauthFailure(error);
  }
}
export const OPTIONS = preflight;
