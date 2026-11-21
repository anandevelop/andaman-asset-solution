/** RFC 8414. Where to sign in, where to get tokens, and what is supported. */
import { authorizationServerMetadata } from "@/lib/mcp/oauth";
import { OAUTH_HEADERS, preflight } from "@/lib/mcp/oauth-http";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(authorizationServerMetadata(), { headers: { ...OAUTH_HEADERS, "Cache-Control": "public, max-age=300" } });
}
export const OPTIONS = preflight;
