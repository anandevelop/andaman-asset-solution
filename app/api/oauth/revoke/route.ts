/** POST /api/oauth/revoke (RFC 7009) — a client ending its own connection. */
import { revokeByToken } from "@/lib/mcp/oauth";
import { oauthJson, preflight, readBody } from "@/lib/mcp/oauth-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await readBody(request);
  await revokeByToken(body.token ?? null).catch((error) => console.error("[oauth/revoke]", error));
  // The same answer whether or not the token existed.
  return oauthJson({}, 200);
}
export const OPTIONS = preflight;
