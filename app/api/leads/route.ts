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
import { LeadSource, PathHitKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { leadInquiryServerSchema, fieldErrors } from "@/lib/validations";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { emailDomain, isDisposableDomain } from "@/lib/email-quality";
import { isDatabaseOfflineError } from "@/lib/db";
import { verifyRecaptcha, describeOutcome } from "@/lib/recaptcha";
import { notifyNewLead } from "@/lib/line";
import { notifyNewLeadByEmail } from "@/lib/email";
import { siteConfig } from "@/config/site";
import { assignCapturedLead } from "@/lib/lead-routing";
import { isEnabled, notifyAdmins } from "@/lib/notifications";
import { countPathHit } from "@/lib/redirects";

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

    const lead = await prisma.leadInquiry.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        phone: data.phone,
        // Pairs with `phone`: the ISO2 CountrySelect.tsx resolved the dial
        // code from, kept alongside it rather than re-derived from `phone`
        // on every read. See LeadInquiry.phoneCountry in schema.prisma.
        phoneCountry: data.phoneCountry?.toUpperCase() ?? null,
        // ISO2 now, not free text — see LeadInquiry.nationality's comment
        // in schema.prisma for why existing free-text rows are untouched.
        nationality: nullify(data.nationality?.toUpperCase(), 2),
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

        // Which language version of the site the form was on, and the
        // page's own path — real signals from the request, not typed by
        // the visitor. See LeadInquiry.commsLanguage/sourcePath.
        commsLanguage: data.commsLanguage ?? null,
        sourcePath: nullify(data.sourcePath, 300),

        // Where the visit began, as opposed to where the form was — see
        // LeadInquiry.landingPath in schema.prisma. Null for every lead
        // created before this shipped, and not backfillable.
        landingPath: nullify(data.landingPath, 500),
        landingReferrer: nullify(data.landingReferrer, 255),
      },
      select: { id: true },
    });

    /*
      Hand the lead to a rep, if the team has automatic routing switched on.

      After the create and outside its transaction on purpose: the capture
      has already succeeded and the visitor is owed a response, so a
      routing failure must leave an unassigned lead on the board rather
      than a lost one. assignCapturedLead swallows its own errors for the
      same reason.
    */
    void assignCapturedLead(lead.id, data.commsLanguage ?? null);

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

    /*
      Both channels are switches on /admin/settings/notifications, and both
      are read here rather than inside the senders so the preference lives
      in one place. Fire-and-forget for the same reason as the two above:
      the lead is saved, and nothing about telling somebody may turn a
      successful capture into an error for the visitor.
    */
    void isEnabled("newLead", "email").then((on) => {
      if (!on) return;
      return notifyNewLeadByEmail({
        name: data.name,
        email: data.email,
        phone: data.phone,
        message: data.message || null,
        projectName: data.projectSlug ?? null,
        source: data.source ?? (projectId ? "PROJECT_PAGE" : "OTHER"),
      });
    });

    void notifyAdmins({
      event: "newLead",
      title: data.name,
      body: data.projectSlug ?? data.email,
      href: `/admin/leads/${lead.id}`,
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
