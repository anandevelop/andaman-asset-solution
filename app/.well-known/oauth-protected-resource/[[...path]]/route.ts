/**
 * RFC 9728. Tells an AI client which authorization server guards /api/mcp.
 * Clients try the path-suffixed form (…/oauth-protected-resource/api/mcp)
 * and then the bare one; both land here.
 */
import { protectedResourceMetadata } from "@/lib/mcp/oauth";
import { OAUTH_HEADERS, preflight } from "@/lib/mcp/oauth-http";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(protectedResourceMetadata(), { headers: { ...OAUTH_HEADERS, "Cache-Control": "public, max-age=300" } });
}
export const OPTIONS = preflight;
