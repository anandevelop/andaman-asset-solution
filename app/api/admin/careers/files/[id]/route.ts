/**
 * GET /api/admin/careers/files/[id]
 * ─────────────────────────────────────────────────────────────────────────
 * An applicant's attachment, for somebody allowed to read it.
 *
 * The files are private objects in the Space: there is no URL to them, and
 * this route is the only way one reaches a browser. It checks
 * manageCareers, writes the audit row, and only then reads the object —
 * in that order, and refusing if the row cannot be written, because an
 * unrecorded look at a CV is what the row exists to rule out.
 *
 * Streamed through this server rather than answered with a signed link:
 * a link works for anyone it is forwarded to until it expires.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { requireCapabilityAction } from "@/lib/admin/guard";
import { prisma } from "@/lib/prisma";
import { recordApplicantFileAccess } from "@/lib/audit/events";
import { readApplicantFile } from "@/lib/careers/files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Types a browser can show in a tab without running anything. */
const INLINE = new Set(["application/pdf", "image/jpeg", "image/png"]);

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireCapabilityAction("manageCareers");
  } catch {
    return NextResponse.json({ error: "UNAUTHORISED" }, { status: 403 });
  }

  const { id } = await params;
  const file = await prisma.jobApplicationFile.findUnique({ where: { id } });
  if (!file) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    await recordApplicantFileAccess({
      actor: session,
      applicationId: file.applicationId,
    });
  } catch (error) {
    console.error("[careers/files] could not record access", error);
    return NextResponse.json({ error: "AUDIT_UNAVAILABLE" }, { status: 503 });
  }

  const object = await readApplicantFile(file.key).catch((error) => {
    console.error("[careers/files] could not read object", error);
    return null;
  });
  if (!object) return NextResponse.json({ error: "FILE_UNAVAILABLE" }, { status: 502 });

  const disposition = INLINE.has(file.contentType) ? "inline" : "attachment";
  return new NextResponse(new Uint8Array(object), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(object.length),
      // filename* carries Thai names; the plain filename is the ASCII fallback.
      "Content-Disposition": `${disposition}; filename="file"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
