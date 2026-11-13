/**
 * app/api/client-error/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/client-error — "an error screen was just shown in this
 * visitor's browser". Sent by lib/report-client-error.ts from the three
 * error boundaries, for failures that happened in the browser itself; one
 * that began on the server is already recorded by instrumentation.ts.
 *
 * Always 204, rate limited per IP, bots ignored. Only the error's name,
 * its message and the page path are kept — no stack, no user agent, no
 * address — and the message is cut to 600 characters.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { isBot } from "@/lib/seo/bots";
import { recordSystemError } from "@/lib/system-errors";

const bodySchema = z.object({
  name: z.string().trim().max(120).default("Error"),
  message: z.string().trim().min(1).max(2000),
  path: z.string().trim().max(500).default("/"),
});

export async function POST(request: Request) {
  const done = new NextResponse(null, { status: 204 });

  if (!rateLimit(`clientError:${clientIp(request.headers)}`, RATE_LIMITS.clientError).ok) return done;
  if (isBot(request.headers.get("user-agent"))) return done;

  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return done;

    const error = new Error(parsed.data.message);
    error.name = parsed.data.name || "Error";
    await recordSystemError(error, { kind: "client", path: parsed.data.path });
  } catch {
    // Unreadable body: nothing to record.
  }
  return done;
}
