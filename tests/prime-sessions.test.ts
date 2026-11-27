/**
 * tests/prime-sessions.test.ts
 * THE PRIME SESSIONS invitation (lib/prime-sessions.ts and
 * POST /api/prime-sessions/rsvp): one reply per agency keyed on the phone
 * number, a "not coming" that holds no seat, and replies that close at
 * noon on the day.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => {
  const tx = {
    eventRegistration: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  };
  return {
    tx,
    event: { upsert: vi.fn() },
    eventRegistration: tx.eventRegistration,
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    pathHitDay: { updateMany: vi.fn(), count: vi.fn(), upsert: vi.fn() },
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/recaptcha", () => ({
  verifyRecaptcha: async () => ({ allowed: true, reason: "ok" }),
  describeOutcome: () => "",
}));
const notifyPrimeRsvp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/line", () => ({ notifyPrimeRsvp }));
vi.mock("@/lib/notifications", () => ({ isEnabled: async () => false, notifyAdmins: vi.fn() }));

import {
  PRIME_SESSIONS,
  normalizePrimePhone,
  primeDaysToGo,
  primeRepliesOpen,
  primeRsvpSchema,
} from "@/lib/prime-sessions";

const BEFORE = new Date("2026-12-01T03:00:00Z");

let ip = 0;
const submit = (over: Record<string, unknown> = {}) =>
  new Request("http://localhost/api/prime-sessions/rsvp", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `10.9.0.${++ip}` },
    body: JSON.stringify({
      agencyName: "Phuket Homes Realty",
      name: "Somchai Jaidee",
      countryCode: "+66",
      phone: "081 274 9031",
      attendance: "ATTENDING",
      guests: 3,
      dietary: "No shellfish",
      consentGiven: true,
      locale: "th",
      ...over,
    }),
  });

describe("lib/prime-sessions", () => {
  it("writes a number the same way however it was typed", () => {
    expect(normalizePrimePhone("+66", "081-274 9031")).toBe("+66812749031");
    expect(normalizePrimePhone("+66", "81 274 9031")).toBe("+66812749031");
    expect(normalizePrimePhone("+7", "(912) 345-67-89")).toBe("+79123456789");
  });

  it("closes replies at noon Bangkok on the day", () => {
    expect(primeRepliesOpen(new Date("2026-12-12T04:59:59Z"))).toBe(true); // 11:59
    expect(primeRepliesOpen(new Date("2026-12-12T05:00:00Z"))).toBe(false); // 12:00
  });

  it("counts days on the Bangkok calendar", () => {
    // 23:30 on the 10th in Bangkok is still two days before.
    expect(primeDaysToGo(new Date("2026-12-10T16:30:00Z"))).toBe(2);
    // 00:30 on the 11th in Bangkok.
    expect(primeDaysToGo(new Date("2026-12-10T17:30:00Z"))).toBe(1);
    // The morning of the 12th: tonight.
    expect(primeDaysToGo(new Date("2026-12-12T02:00:00Z"))).toBe(0);
    // Once it has started there is nothing to count.
    expect(primeDaysToGo(new Date("2026-12-12T12:00:00Z"))).toBeNull();
  });

  it("refuses more guests than an agency may bring, and a bad number", () => {
    const base = {
      agencyName: "A",
      name: "B",
      countryCode: "+66",
      phone: "812749031",
      attendance: "ATTENDING",
      guests: 1,
      consentGiven: true,
    };
    expect(primeRsvpSchema.safeParse(base).success).toBe(true);
    expect(primeRsvpSchema.safeParse({ ...base, guests: PRIME_SESSIONS.maxGuests + 1 }).success).toBe(false);
    expect(primeRsvpSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    expect(primeRsvpSchema.safeParse({ ...base, phone: "call me" }).success).toBe(false);
    expect(primeRsvpSchema.safeParse({ ...base, consentGiven: false }).success).toBe(false);
    expect(primeRsvpSchema.safeParse({ ...base, email: "x@y.z" }).success).toBe(false);
  });
});

describe("POST /api/prime-sessions/rsvp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BEFORE);
    prismaMock.event.upsert.mockResolvedValue({ id: "evt1" });
    prismaMock.tx.eventRegistration.findFirst.mockResolvedValue(null);
    prismaMock.tx.eventRegistration.create.mockResolvedValue({ id: "reg1" });
    prismaMock.tx.eventRegistration.update.mockResolvedValue({ id: "reg1" });
  });
  afterEach(() => vi.useRealTimers());

  it("saves a first reply on the event, without an email, and announces it", async () => {
    const { POST } = await import("@/app/api/prime-sessions/rsvp/route");
    const res = await POST(submit());
    expect(res.status).toBe(201);
    // Found by slug, and made unpublished if it is missing.
    expect(prismaMock.event.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slug: PRIME_SESSIONS.slug },
        create: expect.objectContaining({ isPublished: false }),
      }),
    );
    const [{ data }] = prismaMock.tx.eventRegistration.create.mock.calls[0];
    expect(data).toMatchObject({
      eventId: "evt1",
      email: null,
      phone: "+66812749031",
      agencyName: "Phuket Homes Realty",
      partySize: 3,
      attendance: "ATTENDING",
      dietary: "No shellfish",
      status: "PENDING",
      consentGiven: true,
    });
    expect(notifyPrimeRsvp).toHaveBeenCalledWith(
      expect.objectContaining({ answer: "คาดว่าจะมา", guests: 3, updated: false }),
    );
  });

  it("replaces the earlier answer when the same number replies again", async () => {
    prismaMock.tx.eventRegistration.findFirst.mockResolvedValue({ id: "reg1", status: "CONFIRMED" });
    const { POST } = await import("@/app/api/prime-sessions/rsvp/route");
    const res = await POST(submit({ phone: "81-274-9031", attendance: "MAYBE", guests: 2 }));
    expect(res.status).toBe(200);
    expect(prismaMock.tx.eventRegistration.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: "evt1", phone: "+66812749031" } }),
    );
    expect(prismaMock.tx.eventRegistration.create).not.toHaveBeenCalled();
    const [{ data }] = prismaMock.tx.eventRegistration.update.mock.calls[0];
    // A reply staff have confirmed stays confirmed.
    expect(data).toMatchObject({ attendance: "MAYBE", partySize: 2, status: "CONFIRMED" });
  });

  it("stores 'not coming' as a cancelled row that holds no seat", async () => {
    const { POST } = await import("@/app/api/prime-sessions/rsvp/route");
    await POST(submit({ attendance: "DECLINED", guests: 1, dietary: "vegan" }));
    const [{ data }] = prismaMock.tx.eventRegistration.create.mock.calls[0];
    expect(data).toMatchObject({ attendance: "DECLINED", partySize: 0, status: "CANCELLED", dietary: null });
  });

  it("reopens a cancelled reply when the agency changes its mind", async () => {
    prismaMock.tx.eventRegistration.findFirst.mockResolvedValue({ id: "reg1", status: "CANCELLED" });
    const { POST } = await import("@/app/api/prime-sessions/rsvp/route");
    await POST(submit());
    const [{ data }] = prismaMock.tx.eventRegistration.update.mock.calls[0];
    expect(data).toMatchObject({ status: "PENDING", attendance: "ATTENDING", partySize: 3 });
  });

  it("refuses replies after noon on the day", async () => {
    vi.setSystemTime(new Date("2026-12-12T05:00:01Z"));
    const { POST } = await import("@/app/api/prime-sessions/rsvp/route");
    const res = await POST(submit());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "CLOSED" });
    expect(prismaMock.tx.eventRegistration.create).not.toHaveBeenCalled();
  });

  it("answers a bot that fills the honeypot with a silent success", async () => {
    const { POST } = await import("@/app/api/prime-sessions/rsvp/route");
    const res = await POST(submit({ company: "Spam Co" }));
    expect(res.status).toBe(201);
    expect(prismaMock.event.upsert).not.toHaveBeenCalled();
  });
});
