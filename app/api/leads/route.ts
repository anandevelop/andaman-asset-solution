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
import { LeadSource, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { leadInquiryServerSchema, fieldErrors } from "@/lib/validations";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { isDatabaseOfflineError } from "@/lib/db";
import { verifyRecaptcha, describeOutcome } from "@/lib/recaptcha";
import { notifyNewLead } from "@/lib/line";
import { notifyNewLeadByEmail } from "@/lib/email";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Policy lives in lib/rate-limit.ts alongside every other limit.
const RATE_LIMIT = RATE_LIMITS.leads;

/** Trim to Postgres-friendly length; empty string → null. */
function nullify(value: string | undefined | null, max = 500): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

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
  if (data.company) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // ── reCAPTCHA v3 ──────────────────────────────────────────────────────
  const captcha = await verifyRecaptcha(data.recaptchaToken, "lead_form", ip);

  if (!captcha.allowed) {
    console.warn(`[POST /api/leads] ${describeOutcome(captcha)} ip=${ip}`);
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

    const lead = await prisma.leadInquiry.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        nationality: nullify(data.nationality, 80),
        message: nullify(data.message, 2000),

        projectId,
        source:
          (data.source as LeadSource | undefined) ??
          (projectId ? LeadSource.PROJECT_PAGE : LeadSource.OTHER),

        // PDPA consent trail. The version the visitor actually saw is sent
        // by the form; siteConfig is the fallback for older clients.
        consentGiven: data.consentGiven,
        consentedAt: new Date(),
        consentVersion: data.consentVersion ?? siteConfig.legal.consentVersion,

        utmSource: nullify(data.utmSource, 120),
        utmMedium: nullify(data.utmMedium, 120),
        utmCampaign: nullify(data.utmCampaign, 160),
        ipAddress: ip === "unknown" ? null : ip,
        userAgent: nullify(request.headers.get("user-agent"), 500),
      },
      select: { id: true },
    });

    // Fire-and-forget: the lead is already saved, and a LINE outage must
    // never turn a successful capture into an error for the visitor.
    void notifyNewLead({
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message || null,
      projectName: data.projectSlug ?? null,
      source: data.source ?? (projectId ? "PROJECT_PAGE" : "OTHER"),
    });

    void notifyNewLeadByEmail({
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: data.message || null,
      projectName: data.projectSlug ?? null,
      source: data.source ?? (projectId ? "PROJECT_PAGE" : "OTHER"),
    });

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
