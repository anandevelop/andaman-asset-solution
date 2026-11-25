/**
 * POST /api/careers/upload
 * ─────────────────────────────────────────────────────────────────────────
 * Step 1 of attaching a file to a job application: check one file's name,
 * type and size, and answer with where to PUT it and an upload token. See
 * lib/careers/files.ts for the whole flow and why there is a token.
 *
 * Public, so it is the one place a stranger can cause a write to the
 * Space. What bounds it: the type list and the 5 MB ceiling (signed into
 * the URL, so the Space enforces them), the rate limit per address, the
 * private ACL (nothing uploaded here has an address), and the nightly
 * sweep that deletes uploads no application claimed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isS3Configured } from "@/lib/s3";
import { ticketForUpload } from "@/lib/careers/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  contentType: z.string().min(1).max(120),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`careers-upload:${ip}`, RATE_LIMITS.careersUpload);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "INVALID" }, { status: 400 });

  if (!isS3Configured()) {
    return NextResponse.json({ ok: false, error: "UPLOADS_UNAVAILABLE" }, { status: 503 });
  }

  try {
    const ticket = await ticketForUpload(parsed.data);
    if ("refused" in ticket) return NextResponse.json({ ok: false, error: ticket.refused }, { status: 422 });
    return NextResponse.json({ ok: true, ...ticket }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/careers/upload]", error);
    return NextResponse.json({ ok: false, error: "UPLOADS_UNAVAILABLE" }, { status: 503 });
  }
}
