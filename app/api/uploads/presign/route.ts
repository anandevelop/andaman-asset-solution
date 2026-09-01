/**
 * app/api/uploads/presign/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/uploads/presign — issue a short-lived S3 PUT URL.
 *
 * Signing a URL is granting write access to the bucket, so this goes
 * through requireAdminAction() like every other mutation. Without that, an
 * anonymous caller could mint unlimited upload URLs and use the CDN as free
 * storage.
 *
 * The guard rather than a bare getServerSession() check, because the two
 * are not equivalent: a session alone is also held by an ADMIN who has
 * signed in but not yet enrolled a second factor — the exact state
 * middleware.ts and lib/admin/guard.ts exist to contain, so that a stolen
 * password on its own cannot reach anything. This route was the one
 * authenticated endpoint that let that account through, which made a
 * stolen password enough to write to the bucket.
 *
 * Rate limited per user rather than per IP: an office behind one NAT should
 * not throttle itself while uploading a gallery.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin/guard";
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
  let actor;
  try {
    actor = await requireAdminAction(Role.EDITOR);
  } catch (error) {
    /*
      Two different refusals, kept apart on purpose. "Still owes 2FA" is a
      state the operator can fix in a minute, and reporting it as a plain
      authorisation failure would send them looking at roles instead. The
      uploader keys off `error`, not the status, so both land on its
      generic message today — the distinction is for the server log and for
      whoever reads this next.
    */
    const pending =
      error instanceof Error && error.message === "TWO_FACTOR_SETUP_REQUIRED";

    return NextResponse.json(
      { ok: false, error: pending ? "TWO_FACTOR_SETUP_REQUIRED" : "UNAUTHORISED" },
      { status: 403 },
    );
  }

  const limit = rateLimit(`presign:${actor.id}`, RATE_LIMIT);
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
