/**
 * app/api/prime-sessions/rsvp/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/prime-sessions/rsvp — a partner agency's reply to THE PRIME
 * SESSIONS invitation (app/[locale]/(site)/prime-sessions). See
 * lib/prime-sessions.ts for what this event is and how it differs from an
 * ordinary RSVP.
 *
 * Flow: rate limit → validate → honeypot → reCAPTCHA → still open? →
 * upsert by phone → alerts.
 *
 * ONE REPLY PER AGENCY, KEYED ON THE PHONE NUMBER. The page tells people
 * that sending again with the same number replaces their answer, so a
 * second reply from a number updates the row it made before. The lookup
 * and the write run in one serializable transaction so two quick taps
 * cannot leave two rows.
 *
 * Replacing is a deliberate difference from /api/events/[id]/register,
 * which never overwrites (anyone who knows an address could otherwise
 * rewrite that booking). Here the link is only in invitations sent to
 * partner agencies, the row holds nothing beyond what the reply itself
 * says, and changing your answer is the feature.
 *
 * A "not coming" reply is stored as CANCELLED with partySize 0, so the
 * desk's head counts and the seat bar are right without knowing about
 * this event. A later "coming" from the same number reopens it as PENDING.
 * A row staff have already confirmed or checked in keeps that status.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { EventStatus, PathHitKind, Prisma, type RsvpAttendance } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fieldErrors } from "@/lib/validations";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { isDatabaseOfflineError } from "@/lib/db";
import { verifyRecaptcha, describeOutcome } from "@/lib/recaptcha";
import { notifyAdmins } from "@/lib/notifications";
import { countPathHit } from "@/lib/redirects";
import { notifyPrimeRsvp } from "@/lib/line";
import { siteConfig } from "@/config/site";
import {
  PRIME_SESSIONS,
  normalizePrimePhone,
  primeRepliesOpen,
  primeRsvpSchema,
} from "@/lib/prime-sessions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG = "[POST /api/prime-sessions/rsvp]";

/** For the staff alert, which is read in Thai. */
const ANSWER_TH: Record<RsvpAttendance, string> = {
  ATTENDING: "คาดว่าจะมา",
  MAYBE: "ยังไม่แน่ใจ",
  DECLINED: "ไม่สะดวกมา",
};

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`prime-rsvp:${ip}`, RATE_LIMITS.rsvp);

  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "RATE_LIMITED", retryAfter: limit.retryAfter },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = primeRsvpSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "VALIDATION_FAILED", fields: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }
  const data = parsed.data;

  // Honeypot tripped — accept silently so bots learn nothing.
  if (data.company) {
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const captcha = await verifyRecaptcha(data.recaptchaToken, "prime_rsvp", ip);
  if (!captcha.allowed) {
    console.warn(`${LOG} ${describeOutcome(captcha)}`);
    countPathHit(PathHitKind.FORM_REJECTED, "/api/prime-sessions/rsvp");
    return NextResponse.json({ ok: false, error: "RECAPTCHA_FAILED" }, { status: 403 });
  }

  if (!primeRepliesOpen()) {
    return NextResponse.json({ ok: false, error: "CLOSED" }, { status: 409 });
  }

  const declined = data.attendance === "DECLINED";
  const phone = normalizePrimePhone(data.countryCode, data.phone);
  const partySize = declined ? 0 : data.guests;
  const dietary = declined ? null : data.dietary?.trim() || null;

  try {
    // The migration creates this row so the desk exists before the first
    // reply. If it has gone (deleted by hand, a fresh database), it is made
    // again here rather than turning an agency's reply away.
    const event = await prisma.event.upsert({
      where: { slug: PRIME_SESSIONS.slug },
      create: {
        slug: PRIME_SESSIONS.slug,
        titleEn: PRIME_SESSIONS.title,
        titleTh: PRIME_SESSIONS.title,
        location: "The Residence Prime",
        startsAt: PRIME_SESSIONS.startsAt,
        isPublished: false,
        contentStatus: "DRAFT",
      },
      update: {},
      select: { id: true },
    });

    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.eventRegistration.findFirst({
          where: { eventId: event.id, phone },
          orderBy: { createdAt: "asc" },
          select: { id: true, status: true },
        });

        const values = {
          name: data.name,
          agencyName: data.agencyName,
          phone,
          partySize,
          attendance: data.attendance,
          dietary,
          locale: data.locale ?? null,
          consentGiven: true,
          consentedAt: new Date(),
          consentVersion: data.consentVersion ?? siteConfig.legal.consentVersion,
        };

        if (existing) {
          const status = declined
            ? EventStatus.CANCELLED
            : existing.status === EventStatus.CANCELLED
              ? EventStatus.PENDING
              : existing.status;
          const row = await tx.eventRegistration.update({
            where: { id: existing.id },
            data: { ...values, status },
            select: { id: true },
          });
          return { id: row.id, updated: true };
        }

        const row = await tx.eventRegistration.create({
          data: {
            ...values,
            eventId: event.id,
            email: null,
            status: declined ? EventStatus.CANCELLED : EventStatus.PENDING,
          },
          select: { id: true },
        });
        return { id: row.id, updated: false };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    // Fire-and-forget: the reply is already committed.
    void notifyPrimeRsvp({
      eventId: event.id,
      agencyName: data.agencyName,
      name: data.name,
      phone,
      answer: ANSWER_TH[data.attendance],
      guests: partySize,
      dietary,
      updated: result.updated,
    });

    void notifyAdmins({
      event: "eventRegistration",
      title: data.agencyName,
      body: `THE PRIME SESSIONS · ${ANSWER_TH[data.attendance]}${partySize > 0 ? ` · ${partySize} คน` : ""}`,
      href: `/admin/events/${event.id}/registrations`,
    });

    return NextResponse.json(
      { ok: true, id: result.id, updated: result.updated },
      { status: result.updated ? 200 : 201 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    ) {
      return NextResponse.json(
        { ok: false, error: "WRITE_CONFLICT" },
        { status: 409, headers: { "Retry-After": "1" } },
      );
    }
    if (isDatabaseOfflineError(error)) {
      console.error(`${LOG} database unreachable — reply NOT saved`, error);
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }
    console.error(`${LOG} unexpected error`, error);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}
