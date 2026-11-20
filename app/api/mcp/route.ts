/**
 * app/api/mcp/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/mcp — the AI connection (Model Context Protocol).
 *
 * This file is the HTTP half: the key, the limits, the headers. The
 * protocol is lib/mcp/protocol.ts and the tools are lib/mcp/tools/*.
 *
 * ORDER OF CHECKS
 *
 * Origin first. A browser page on another site must not be able to drive
 * this endpoint with a key it found, so a request that carries an Origin
 * other than ours is refused before anything is read. AI clients are not
 * browsers and send none.
 *
 * Then the key. Every method needs one, discovery included: what this
 * server can do is not public. Failed attempts are counted per address so
 * keys cannot be guessed at speed; a working key has its own, roomier
 * budget so a client stuck in a loop slows itself down and nobody else.
 *
 * No sessions and no streams: one message in, one JSON answer out, which is
 * all a tools-only server needs and is what the 2026-07-28 revision asks
 * for. GET and DELETE have nothing to do and say so.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { after, NextResponse } from "next/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { bearerFrom, verifyApiToken } from "@/lib/mcp/tokens";
import { runAsMcp } from "@/lib/mcp/context";
import { handleMcp } from "@/lib/mcp/protocol";
import { runDueJobs } from "@/lib/mcp/jobs";
import "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;
const BAD_KEY_LIMIT = { limit: 20, windowMs: 10 * 60_000 };
const CALL_LIMIT = { limit: 120, windowMs: 60_000 };

function siteOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://andamanassetsolution.com").origin;
  } catch {
    return "https://andamanassetsolution.com";
  }
}

function rpcError(status: number, code: number, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== siteOrigin()) return rpcError(403, -32600, "Origin not allowed.");

  const ip = clientIp(request.headers);
  const blocked = rateLimit(`mcp:bad-key:${ip}`, { ...BAD_KEY_LIMIT, check: true });
  if (!blocked.ok) return rpcError(429, -32000, "Too many failed attempts.", { "Retry-After": String(blocked.retryAfter) });

  const actor = await verifyApiToken(bearerFrom(request.headers.get("authorization")), ip);
  if (!actor) {
    rateLimit(`mcp:bad-key:${ip}`, BAD_KEY_LIMIT);
    return rpcError(401, -32001, "A valid key is required.", { "WWW-Authenticate": 'Bearer realm="mcp"' });
  }

  const budget = rateLimit(`mcp:key:${actor.tokenId}`, CALL_LIMIT);
  if (!budget.ok) return rpcError(429, -32000, "Rate limit reached for this key.", { "Retry-After": String(budget.retryAfter) });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return rpcError(413, -32600, "Request too large.");
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return rpcError(413, -32600, "Request too large.");

  const answer = await runAsMcp(actor, () =>
    handleMcp(
      raw,
      {
        protocolVersion: request.headers.get("mcp-protocol-version"),
        method: request.headers.get("mcp-method"),
        name: request.headers.get("mcp-name"),
      },
      actor,
    ),
  );

  // Anything a tool queued starts now rather than at the next cron minute.
  after(() => runDueJobs({ budgetMs: 40_000 }).catch((error) => console.error("[mcp] background run failed", error)));

  if (answer.body === null) return new NextResponse(null, { status: answer.status });
  return NextResponse.json(answer.body, { status: answer.status, headers: { "Cache-Control": "no-store" } });
}

function notAllowed() {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

export const GET = notAllowed;
export const DELETE = notAllowed;
