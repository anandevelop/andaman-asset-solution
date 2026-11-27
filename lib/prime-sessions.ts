/**
 * lib/prime-sessions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * THE PRIME SESSIONS — Live Jazz, Wine & the Privilege Card Launch.
 * Saturday 12 December 2026, 19:00 Bangkok, at The Residence Prime.
 *
 * A one-evening invitation for partner agencies, with a page of its own
 * (/[locale]/prime-sessions) that only people holding the link reach: it is
 * not listed, not indexed and has no site navigation. The replies are kept
 * where every other event's are — EventRegistration rows on the Event whose
 * slug is PRIME_SESSIONS.slug, created unpublished by the migration
 * 20261127090000_prime_sessions — so the existing registrations desk in the
 * back office lists them, filters them and checks people in at the door.
 *
 * What differs from the ordinary RSVP form (components/EventRsvpForm.tsx):
 *  - one reply per agency, keyed on the phone number; sending again from
 *    the same number replaces the earlier answer, which is what the page
 *    tells people to do if their plans change.
 *  - no email address. An agency answers with a phone or WhatsApp number.
 *  - an answer, not just a booking: attending, not sure yet, or not
 *    coming, plus how many people and any dietary needs.
 *  - replies close at noon on the day (PRIME_SESSIONS.replyBy).
 *
 * This file is imported by the page (client) and the API route (server),
 * so it holds no server-only code.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { z } from "zod";
import { locales } from "@/i18n";

export const PRIME_SESSIONS = {
  /** Event.slug of the row the replies are attached to. */
  slug: "the-prime-sessions",
  title: "THE PRIME SESSIONS — Live Jazz, Wine & the Privilege Card Launch",
  /** 19:00 in Bangkok (UTC+7). */
  startsAt: new Date("2026-12-12T12:00:00.000Z"),
  /** Replies close at 12:00 noon in Bangkok on the day itself. */
  replyBy: new Date("2026-12-12T05:00:00.000Z"),
  /** Most people one agency may bring, the person replying included. */
  maxGuests: 6,
} as const;

/** The three answers, in the order the form offers them. */
export const PRIME_ATTENDANCE = ["ATTENDING", "MAYBE", "DECLINED"] as const;
export type PrimeAttendance = (typeof PRIME_ATTENDANCE)[number];

export function primeRepliesOpen(now: Date = new Date()): boolean {
  return now.getTime() < PRIME_SESSIONS.replyBy.getTime();
}

/**
 * Whole days from today to the evening, counted on the Bangkok calendar
 * rather than in 24-hour blocks: on the morning of the 11th it is "1 day",
 * on the 12th it is 0 ("tonight"). Null once the evening has begun.
 */
export function primeDaysToGo(now: Date = new Date()): number | null {
  const start = PRIME_SESSIONS.startsAt.getTime();
  if (now.getTime() >= start) return null;
  const bangkokDay = (ms: number) => Math.floor((ms + 7 * 3_600_000) / 86_400_000);
  return Math.max(0, bangkokDay(start) - bangkokDay(now.getTime()));
}

/** Digits of a phone number with its leading + kept: "+66 81-234 5678" → "+66812345678". */
export function normalizePrimePhone(countryCode: string, local: string): string {
  const code = countryCode.replace(/[^\d]/g, "");
  // A local number written with its trunk 0 (081…) is the same line as 81….
  const digits = local.replace(/[^\d]/g, "").replace(/^0+/, "");
  return `+${code}${digits}`;
}

export const primeRsvpSchema = z
  .object({
    agencyName: z.string().trim().min(1).max(160),
    name: z.string().trim().min(1).max(120),
    countryCode: z.string().trim().regex(/^\+\d{1,4}$/),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9()\-\s]+$/)
      .refine((value) => {
        const digits = value.replace(/\D/g, "").length;
        return digits >= 7 && digits <= 15;
      }),
    attendance: z.enum(PRIME_ATTENDANCE),
    guests: z.number().int().min(1).max(PRIME_SESSIONS.maxGuests),
    dietary: z.string().trim().max(300).optional().or(z.literal("")),
    consentGiven: z.literal(true),
    consentVersion: z.string().trim().max(64).optional(),
    recaptchaToken: z.string().max(4000).nullish(),
    locale: z.enum(locales).optional(),
    // Honeypot — any value is accepted here so the route can answer a bot
    // with a silent success (see eventRegistrationServerSchema's note).
    company: z.string().max(200).optional(),
  })
  .strict();

export type PrimeRsvpInput = z.infer<typeof primeRsvpSchema>;
