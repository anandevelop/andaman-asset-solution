/**
 * POST /api/oauth/register — dynamic client registration (RFC 7591).
 *
 * Open to anyone, as the RFC intends: being registered grants nothing. A
 * client can only ever receive a token after an administrator has signed in
 * and approved it on the consent screen. Rate limited so the table cannot
 * be filled for sport.
 */
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { registerClient } from "@/lib/mcp/oauth";
import { oauthFailure, oauthJson, preflight } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const limit = rateLimit(`oauth:register:${clientIp(request.headers)}`, { limit: 10, windowMs: 60 * 60_000 });
  if (!limit.ok) return oauthJson({ error: "temporarily_unavailable" }, 429, { "Retry-After": String(limit.retryAfter) });

  try {
    const text = await request.text();
    if (text.length > 16 * 1024) return oauthJson({ error: "invalid_client_metadata", error_description: "Too large." }, 400);
    const client = await registerClient(JSON.parse(text || "{}"));
    return oauthJson(
      {
        client_id: client.clientId,
        client_name: client.name,
        redirect_uris: client.redirectUris,
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      201,
    );
  } catch (error) {
    if (error instanceof SyntaxError) return oauthJson({ error: "invalid_client_metadata", error_description: "Body is not JSON." }, 400);
    return oauthFailure(error);
  }
}
export const OPTIONS = preflight;
