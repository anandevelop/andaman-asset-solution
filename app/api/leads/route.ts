/**
 * app/api/leads/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/leads — public lead capture endpoint used by <LeadForm />.
 *
 * Flow: rate limit → zod validate → resolve project by slug → persist a
 * LeadInquiry with the PDPA consent trail (version, timestamp, IP, UA).
 *
 * On success it pushes a LINE notification to the sales team, plus a staff
 * notification email as a second channel (see lib/email.ts) — both
 * fire-and-forget: the lead is already committed, so a LINE or SMTP outage
 * must never turn a successful capture into an error for the visitor.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { PathHitKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { leadInquiryServerSchema, fieldErrors } from "@/lib/validations";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { emailDomain, isDisposableDomain } from "@/lib/email-quality";
import { isDatabaseOfflineError } from "@/lib/db";
import { verifyRecaptcha, describeOutcome } from "@/lib/recaptcha";
import { announceLead, leadCreateData, noticeOf } from "@/lib/leads/capture";
import { holdSuspect, isBlockedSender, recentSubmissionCount } from "@/lib/leads/suspect";
import { isSuspect, spamSignals } from "@/lib/leads/spam-signals";
import { countPathHit } from "@/lib/redirects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Policy lives in lib/rate-limit.ts alongside every other limit.
const RATE_LIMIT = RATE_LIMITS.leads;

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`leads:${ip}`, RATE_LIMIT);

  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", retryAfter: limit.retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfter),
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  // ── Parse & validate ──────────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_JSON" },
      { status: 400 },
    );
  }

  const parsed = leadInquiryServerSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_FAILED", fields: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const data = parsed.data;

  // Honeypot tripped — accept silently so bots don't learn the shape.
  // Checked first: a bot's email domain is not worth rejecting on when it
  // is about to get a silent fake-success regardless.
  if (data.company) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // The same rule the inline check (app/api/validate-email/route.ts)
  // already showed the visitor on the page, enforced again here — a
  // script posting straight at this endpoint never went through that one
  // at all. DISPOSABLE_EMAIL is a sentinel, not a display string; see
  // LeadForm.tsx's own emailError for where it becomes
  // leadForm.emailCheck.disposable, the same translated sentence the
  // inline check itself shows for this verdict.
  if (isDisposableDomain(emailDomain(data.email) ?? "")) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_FAILED", fields: { email: "DISPOSABLE_EMAIL" } },
      { status: 422 },
    );
  }

  // ── reCAPTCHA v3 ──────────────────────────────────────────────────────
  const captcha = await verifyRecaptcha(data.recaptchaToken, "lead_form", ip);

  if (!captcha.allowed) {
    console.warn(`[POST /api/leads] ${describeOutcome(captcha)} ip=${ip}`);
    // Counted so the settings screen can say what the spam filter is
    // actually stopping, rather than only that a key is configured.
    countPathHit(PathHitKind.FORM_REJECTED, "/api/leads");
    return NextResponse.json(
      { ok: false, error: "RECAPTCHA_FAILED" },
      { status: 403 },
    );
  }

  if (captcha.reason === "skipped") {
    console.warn(`[POST /api/leads] recaptcha ${describeOutcome(captcha)}`);
  }

  // ── Resolve project + persist ─────────────────────────────────────────
  try {
    let projectId: string | null = null;

    if (data.projectSlug) {
      const project = await prisma.project.findUnique({
        where: { slug: data.projectSlug },
        select: { id: true, isPublished: true, deletedAt: true },
      });

      if (!project || !project.isPublished || project.deletedAt) {
        return NextResponse.json(
          { ok: false, error: "PROJECT_NOT_FOUND" },
          { status: 404 },
        );
      }
      projectId = project.id;
    }

    const createData = leadCreateData(data, {
      projectId,
      ip,
      userAgent: request.headers.get("user-agent"),
    });
    const notice = noticeOf(data, projectId);
    const quietSuccess = NextResponse.json({ ok: true }, { status: 201 });

    /*
      A sender an admin has marked as spam: answered like a success and
      stored nowhere, the honeypot's treatment, so nothing is learned.
    */
    if (await isBlockedSender(data.email, data.phone)) return quietSuccess;

    /*
      Looks like a test or spam ("test", asdf, 0812345678 — see
      lib/leads/spam-signals.ts): held for an admin on /admin/leads/suspect
      instead of becoming a lead. Nobody is notified or assigned, and no
      report counts it, until somebody lets it through. The visitor sees
      the same success as anyone — a real person caught by a rule is not
      told they look fake, and is a click away from being let in.
    */
    const signals = spamSignals({
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message,
      recentSubmissions: await recentSubmissionCount(data.email, data.phone),
    });
    if (isSuspect(signals)) {
      await holdSuspect(createData, notice, signals);
      return quietSuccess;
    }

    const lead = await prisma.leadInquiry.create({ data: createData, select: { id: true } });
    announceLead(lead.id, notice);

    return NextResponse.json(
      { ok: true, id: lead.id },
      {
        status: 201,
        headers: {
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      },
    );
  } catch (error) {
    // Database down — 503 + Retry-After, so the client knows the submission
    // is worth retrying rather than being malformed.
    if (isDatabaseOfflineError(error)) {
      console.error("[POST /api/leads] database unreachable — lead NOT saved", error);
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[POST /api/leads] prisma error", error.code, error.message);
    } else {
      console.error("[POST /api/leads] unexpected error", error);
    }
    return NextResponse.json(
      { ok: false, error: "SERVER_ERROR" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}
