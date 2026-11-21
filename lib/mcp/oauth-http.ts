/**
 * Shared by the OAuth routes: the headers every answer carries and the
 * shape of an OAuth error. Browser-based clients call the metadata, token
 * and registration endpoints across origins; none of them reads a cookie,
 * so any origin may.
 */

import { NextResponse } from "next/server";
import { OAuthError } from "@/lib/mcp/oauth";

export const OAUTH_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, MCP-Protocol-Version",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

export function oauthJson(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...OAUTH_HEADERS, ...extra } });
}

export function oauthFailure(error: unknown) {
  if (error instanceof OAuthError) {
    return oauthJson({ error: error.code, error_description: error.message }, error.code === "invalid_client" ? 401 : 400);
  }
  console.error("[oauth]", error);
  return oauthJson({ error: "server_error", error_description: "The request could not be completed." }, 500);
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: OAUTH_HEADERS });
}

/** A token or registration body: form-encoded per the RFCs, JSON tolerated. */
export async function readBody(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get("content-type") ?? "";
  const text = await request.text();
  if (text.length > 64 * 1024) return {};
  if (type.includes("application/json")) {
    try {
      const parsed = JSON.parse(text);
      return Object.fromEntries(Object.entries(parsed ?? {}).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(text));
}
