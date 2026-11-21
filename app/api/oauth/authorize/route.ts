/**
 * GET /api/oauth/authorize — where an AI client sends the browser to sign in.
 *
 * Checks the request and hands over to the consent page in the back office,
 * which is behind the ordinary administrator sign-in (password and second
 * factor). An error found here is shown on this site and never forwarded to
 * redirect_uri: until the client and its redirect URI have been verified,
 * redirect_uri is just an address a stranger typed.
 */
import { NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { beginAuthorization, OAuthError, siteOrigin } from "@/lib/mcp/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function problem(message: string, status = 400) {
  const safe = message.replace(/[<>&]/g, "");
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>Cannot connect</title><body style="font-family:system-ui;max-width:32rem;margin:15vh auto;padding:0 1.5rem;color:#0d2635"><h1 style="font-size:1.25rem">This connection request cannot be completed</h1><p>${safe}</p><p style="color:#516573;font-size:.875rem">Start again from the application you were connecting.</p></body>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const limit = rateLimit(`oauth:authorize:${clientIp(request.headers)}`, { limit: 30, windowMs: 10 * 60_000 });
  if (!limit.ok) return problem("Too many attempts. Try again in a few minutes.", 429);

  const query = new URL(request.url).searchParams;
  try {
    const { requestId } = await beginAuthorization({
      responseType: query.get("response_type"),
      clientId: query.get("client_id"),
      redirectUri: query.get("redirect_uri"),
      codeChallenge: query.get("code_challenge"),
      codeChallengeMethod: query.get("code_challenge_method"),
      state: query.get("state"),
      scope: query.get("scope"),
      resource: query.get("resource"),
    });
    const locale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE || "th";
    return NextResponse.redirect(`${siteOrigin()}/${locale}/admin/settings/integrations/authorize?request=${requestId}`, 302);
  } catch (error) {
    if (error instanceof OAuthError) return problem(error.message);
    console.error("[oauth/authorize]", error);
    return problem("Something went wrong on our side.", 500);
  }
}
