/**
 * app/api/uploads/presign/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/uploads/presign — issue a short-lived S3 PUT URL.
 *
 * Signing a URL is granting write access to the bucket, so this is behind
 * the same session check as the admin itself. Without that, an anonymous
 * caller could mint unlimited upload URLs and use the CDN as free storage.
 *
 * Rate limited per user rather than per IP: an office behind one NAT should
 * not throttle itself while uploading a gallery.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import {
  getPresignedUploadUrl,
  isAllowedContentType,
  isS3Configured,
  maxBytesFor,
} from "@/lib/s3";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = RATE_LIMITS.presign;

const bodySchema = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(100),
  /** Checked here so an oversized file is refused before it is uploaded. */
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  /** Folder within the bucket, e.g. "projects" | "news" | "progress". */
  prefix: z.string().trim().max(80).optional(),
  /** Second path segment — usually the record's slug. */
  slug: z.string().trim().max(120).optional(),
});

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "UNAUTHORISED" }, { status: 401 });
  }

  const limit = rateLimit(`presign:${session.user.id}`, RATE_LIMIT);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  if (!isS3Configured()) {
    // A distinct code so the uploader can tell the operator what to fix,
    // rather than showing a generic failure.
    return NextResponse.json(
      { ok: false, error: "S3_NOT_CONFIGURED" },
      { status: 501 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "VALIDATION_FAILED" }, { status: 422 });
  }

  const { contentType, size, prefix, slug } = parsed.data;

  // Content type drives the object extension, so an unknown one cannot be
  // allowed through with a guess.
  if (!isAllowedContentType(contentType)) {
    return NextResponse.json(
      {
        ok: false,
        error: "UNSUPPORTED_TYPE",
        allowed: ["jpeg", "png", "webp", "avif", "pdf", "mp4", "webm"],
      },
      { status: 415 },
    );
  }

  // Documents get a larger allowance than photographs.
  const maxBytes = maxBytesFor(contentType);

  if (size !== undefined && size > maxBytes) {
    return NextResponse.json(
      { ok: false, error: "FILE_TOO_LARGE", maxBytes },
      { status: 413 },
    );
  }

  try {
    const presigned = await getPresignedUploadUrl({ contentType, prefix, slug });

    return NextResponse.json(
      { ok: true, ...presigned },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[POST /api/uploads/presign] failed to sign upload", error);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}
