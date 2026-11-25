/**
 * POST /api/careers/apply
 * ─────────────────────────────────────────────────────────────────────────
 * Receives a job application from the public form.
 *
 * The same defences as the enquiry form (app/api/leads/route.ts), in the
 * same order: rate limit, schema, honeypot, reCAPTCHA. A filled honeypot
 * is answered like a success and stored nowhere.
 *
 * The application is saved first and HR is told afterwards, in after():
 * the applicant's "received" must not wait on a mail server sending three
 * attachments, and must not turn into an error if that send fails — the
 * outcome is recorded on the row (emailSentAt / emailError) instead.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { after, NextResponse } from "next/server";
import { clientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { isDatabaseOfflineError } from "@/lib/db";
import { describeOutcome, verifyRecaptcha } from "@/lib/recaptcha";
import { applicationSchema, fieldErrors } from "@/lib/careers/fields";
import { submitApplication } from "@/lib/careers/applications";
import { notifyNewApplication } from "@/lib/careers/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`careers-apply:${ip}`, RATE_LIMITS.careersApply);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  const parsed = applicationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_FAILED", fields: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }
  const data = parsed.data;

  if (data.company) return NextResponse.json({ ok: true }, { status: 201 });

  const captcha = await verifyRecaptcha(data.recaptchaToken, "job_application", ip);
  if (!captcha.allowed) {
    console.warn(`[POST /api/careers/apply] ${describeOutcome(captcha)} ip=${ip}`);
    return NextResponse.json({ ok: false, error: "RECAPTCHA_FAILED" }, { status: 403 });
  }

  try {
    const result = await submitApplication(data, { ip, userAgent: request.headers.get("user-agent") });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });

    after(() => notifyNewApplication(result.id));

    // droppedFiles: attachments whose upload did not complete. The form
    // says so, so the applicant knows to send them another way.
    return NextResponse.json({ ok: true, droppedFiles: result.droppedFiles }, { status: 201 });
  } catch (error) {
    if (isDatabaseOfflineError(error)) {
      return NextResponse.json({ ok: false, error: "SERVICE_UNAVAILABLE" }, { status: 503 });
    }
    console.error("[POST /api/careers/apply]", error);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
