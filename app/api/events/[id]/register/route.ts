/**
 * app/api/events/[id]/register/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/events/:id/register — public RSVP endpoint used by <EventRsvpForm />.
 *
 * Flow: rate limit → validate → load event → capacity check → persist.
 *
 * Capacity is the subtle part. Counting seats and then inserting is a
 * classic check-then-act race: two requests for the last seat both read
 * "one left" and both succeed. The insert therefore runs inside a
 * serializable transaction that re-counts immediately before writing, so
 * the second one is rolled back rather than overbooking the event.
 *
 * The (eventId, email) unique key is treated as an update, not an error —
 * someone re-submitting the form is almost always correcting their party
 * size, not attacking us.
 *
 * On success this pushes a LINE alert plus a staff notification email to
 * the team, and — the thing the RSVP copy explicitly promises — a
 * confirmation email to the attendee, in the language of the page they
 * registered from. See lib/email.ts. All three are fire-and-forget: the
 * registration is already committed by the time any of them run.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { EventStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eventRegistrationServerSchema, fieldErrors } from "@/lib/validations";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { isDatabaseOfflineError } from "@/lib/db";
import { verifyRecaptcha, describeOutcome } from "@/lib/recaptcha";
import { notifyNewRegistration } from "@/lib/line";
import { notifyNewRegistrationByEmail, sendRsvpConfirmationEmail } from "@/lib/email";
import { SEAT_TAKING_STATUSES } from "@/lib/events";
import { pickLocale } from "@/lib/locale";
import { getTranslation } from "@/lib/get-translation";
import { siteConfig } from "@/config/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = RATE_LIMITS.rsvp;

function nullify(value: string | undefined | null, max = 1000): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, max);
}

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, props: Params) {
  const params = await props.params;
  const ip = clientIp(request.headers);
  const limit = rateLimit(`rsvp:${ip}`, RATE_LIMIT);

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
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const parsed = eventRegistrationServerSchema.safeParse(payload);
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

  const captcha = await verifyRecaptcha(data.recaptchaToken, "event_rsvp", ip);

  if (!captcha.allowed) {
    console.warn(`[POST /api/events/${params.id}/register] ${describeOutcome(captcha)}`);
    return NextResponse.json({ ok: false, error: "RECAPTCHA_FAILED" }, { status: 403 });
  }

  if (captcha.reason === "skipped") {
    console.warn(
      `[POST /api/events/${params.id}/register] recaptcha ${describeOutcome(captcha)}`,
    );
  }

  try {
    // sandbox: `prisma as any` — `translations` is a relation added to
    // Event in the follow-up i18n pass (see schema.prisma's Event model)
    // that the locally generated Prisma client doesn't type yet; same
    // tradeoff as getProjectBySlug in lib/projects.ts.
    const event = await (prisma as any).event.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        isPublished: true,
        capacity: true,
        startsAt: true,
        endsAt: true,
        titleEn: true,
        titleTh: true,
        translations: true,
        location: true,
      },
    });

    if (!event || !event.isPublished) {
      return NextResponse.json({ ok: false, error: "EVENT_NOT_FOUND" }, { status: 404 });
    }

    const eventTitleFor = (locale: string) =>
      getTranslation<any>(event.translations, locale)?.title ??
      pickLocale(locale, event.titleTh, event.titleEn);

    // Registering for something that already finished is never intentional.
    if ((event.endsAt ?? event.startsAt) < new Date()) {
      return NextResponse.json({ ok: false, error: "EVENT_PAST" }, { status: 409 });
    }

    const registration = await prisma.$transaction(
      async (tx) => {
        // Does this address already hold a booking? If so we are updating
        // it, and their existing seats should not count against them.
        const existing = await tx.eventRegistration.findUnique({
          where: { eventId_email: { eventId: event.id, email: data.email } },
          select: { id: true, partySize: true, status: true },
        });

        if (event.capacity !== null) {
          const taken = await tx.eventRegistration.aggregate({
            where: {
              eventId: event.id,
              status: { in: [...SEAT_TAKING_STATUSES] },
              ...(existing ? { id: { not: existing.id } } : {}),
            },
            _sum: { partySize: true },
          });

          const seatsLeft = event.capacity - (taken._sum.partySize ?? 0);

          // Every registration is exactly one seat since the agent-partner
          // redesign (no more client-supplied party size) — a new booking
          // only ever needs 1 seat left, not `data.partySize > seatsLeft`.
          if (seatsLeft < 1) {
            // Thrown so the transaction rolls back; caught and mapped to a
            // 409 below.
            throw new CapacityError(Math.max(0, seatsLeft));
          }
        }

        const values = {
          name: data.name,
          agencyName: data.agencyName,
          email: data.email,
          phone: data.phone,
          whatsapp: nullify(data.whatsapp),
          // Always 1 — see partySize's comment in schema.prisma.
          partySize: 1,
          notes: null,
          consentGiven: data.consentGiven,
          consentedAt: new Date(),
          consentVersion: data.consentVersion ?? siteConfig.legal.consentVersion,
        };

        return tx.eventRegistration.upsert({
          where: { eventId_email: { eventId: event.id, email: data.email } },
          create: { ...values, eventId: event.id, status: EventStatus.PENDING },
          // Re-submitting after cancelling should reinstate the booking.
          update: {
            ...values,
            ...(existing?.status === EventStatus.CANCELLED
              ? { status: EventStatus.PENDING }
              : {}),
          },
          select: { id: true, status: true },
        });
      },
      // Serializable is what actually closes the race — without it, two
      // concurrent aggregates can both see the same "seats left".
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    void notifyNewRegistration({
      name: data.name,
      email: data.email,
      phone: data.phone,
      agencyName: data.agencyName,
      whatsapp: nullify(data.whatsapp),
      eventId: event.id,
    });

    // Second channel for the staff alert, and the confirmation the RSVP
    // copy explicitly promises the attendee ("we will confirm by email").
    // Both fire-and-forget: the registration is already committed, so an
    // SMTP outage must never turn a successful RSVP into an error here.
    void notifyNewRegistrationByEmail({
      name: data.name,
      email: data.email,
      phone: data.phone,
      agencyName: data.agencyName,
      whatsapp: nullify(data.whatsapp),
      // Staff read Thai first, same as the LINE notification's copy.
      eventTitle: eventTitleFor("th"),
    });

    void sendRsvpConfirmationEmail({
      to: data.email,
      name: data.name,
      locale: data.locale ?? "en",
      eventTitle: eventTitleFor(data.locale ?? "en"),
      location: event.location,
      startsAt: event.startsAt,
    });

    return NextResponse.json(
      { ok: true, id: registration.id, status: registration.status },
      {
        status: 201,
        headers: {
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": String(limit.remaining),
        },
      },
    );
  } catch (error) {
    if (error instanceof CapacityError) {
      return NextResponse.json(
        { ok: false, error: "CAPACITY_EXCEEDED", seatsLeft: error.seatsLeft },
        { status: 409 },
      );
    }

    // Serializable transactions can abort under contention (P2034). That is
    // a retry signal, not a client mistake.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    ) {
      return NextResponse.json(
        { ok: false, error: "WRITE_CONFLICT" },
        { status: 409, headers: { "Retry-After": "1" } },
      );
    }

    if (isDatabaseOfflineError(error)) {
      console.error(
        `[POST /api/events/${params.id}/register] database unreachable — RSVP NOT saved`,
        error,
      );
      return NextResponse.json(
        { ok: false, error: "DATABASE_UNAVAILABLE" },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }

    console.error(`[POST /api/events/${params.id}/register] unexpected error`, error);
    return NextResponse.json({ ok: false, error: "SERVER_ERROR" }, { status: 500 });
  }
}

/** Sentinel used to roll the transaction back when the event is full. */
class CapacityError extends Error {
  constructor(readonly seatsLeft: number) {
    super("CAPACITY_EXCEEDED");
    this.name = "CapacityError";
  }
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}
