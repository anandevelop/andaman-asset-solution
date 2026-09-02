/**
 * tests/events.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Seat counting, and the split between upcoming and past.
 *
 * `seatsLeft` is the number the RSVP form shows and the capacity check
 * refuses on, so getting it wrong either turns paying attendees away from
 * an event with room, or oversells one without. It had no test at all.
 *
 * Written when the seat sum moved out of Node and into a `groupBy`: the
 * select used to carry every seat-taking registration for every event so
 * it could reduce them to one integer per card. The arithmetic is the part
 * that must not change, which is exactly what a test is for.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const { findMany, groupBy } = vi.hoisted(() => ({
  findMany: vi.fn(),
  groupBy: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { event: { findMany }, eventRegistration: { groupBy } },
}));

import { getPublishedEvents } from "@/lib/events";

const HOUR = 60 * 60 * 1000;

/** An event row shaped like the `select` in lib/events.ts. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "evt-1",
  slug: "open-house",
  titleEn: "Open House",
  titleTh: "เปิดบ้าน",
  descriptionEn: "Come and see",
  descriptionTh: "เชิญชม",
  translations: [],
  location: "Phuket",
  startsAt: new Date(Date.now() + 24 * HOUR),
  endsAt: null,
  coverImageUrl: null,
  capacity: 10,
  ...over,
});

/** A groupBy result row. */
const seats = (eventId: string, partySize: number | null) => ({
  eventId,
  _sum: { partySize },
});

beforeEach(() => {
  findMany.mockReset();
  groupBy.mockReset();
  groupBy.mockResolvedValue([]);
});

describe("seat counting", () => {
  it("counts party size, not registrations", async () => {
    // One booking for four people takes four seats. Counting rows instead
    // would report nine seats left on an event with six.
    findMany.mockResolvedValue([row({ capacity: 10 })]);
    groupBy.mockResolvedValue([seats("evt-1", 4)]);

    const { upcoming } = await getPublishedEvents("en");

    expect(upcoming[0].seatsLeft).toBe(6);
  });

  it("gives an event with no registrations its full capacity", async () => {
    // groupBy returns no row at all for an event nobody has booked, which
    // is not the same as a row summing to zero — both have to mean "full
    // capacity left", and only one of them is in the result set.
    findMany.mockResolvedValue([row({ capacity: 25 })]);
    groupBy.mockResolvedValue([]);

    const { upcoming } = await getPublishedEvents("en");

    expect(upcoming[0].seatsLeft).toBe(25);
  });

  it("never reports a negative number of seats", async () => {
    // Capacity can be lowered after people have booked. "-3 seats left"
    // is not a thing to put on a page.
    findMany.mockResolvedValue([row({ capacity: 5 })]);
    groupBy.mockResolvedValue([seats("evt-1", 8)]);

    const { upcoming } = await getPublishedEvents("en");

    expect(upcoming[0].seatsLeft).toBe(0);
  });

  it("leaves seatsLeft null for an event with no capacity limit", async () => {
    findMany.mockResolvedValue([row({ capacity: null })]);
    groupBy.mockResolvedValue([seats("evt-1", 40)]);

    const { upcoming } = await getPublishedEvents("en");

    expect(upcoming[0].seatsLeft).toBeNull();
  });

  it("keeps each event's seats to itself", async () => {
    // The join is by id through a Map; getting it wrong shows one event's
    // bookings against another's capacity.
    findMany.mockResolvedValue([
      row({ id: "evt-1", slug: "a", capacity: 10 }),
      row({ id: "evt-2", slug: "b", capacity: 10 }),
    ]);
    groupBy.mockResolvedValue([seats("evt-2", 7)]);

    const { upcoming } = await getPublishedEvents("en");

    expect(upcoming.find((e) => e.slug === "a")?.seatsLeft).toBe(10);
    expect(upcoming.find((e) => e.slug === "b")?.seatsLeft).toBe(3);
  });

  it("asks the database for a sum rather than for the rows", async () => {
    // The point of the change: the registrations are never fetched.
    findMany.mockResolvedValue([row()]);

    await getPublishedEvents("en");

    expect(findMany.mock.calls[0][0].select).not.toHaveProperty("registrations");
    expect(groupBy.mock.calls[0][0]._sum).toEqual({ partySize: true });
  });

  it("does not query registrations at all when there are no events", async () => {
    findMany.mockResolvedValue([]);

    await getPublishedEvents("en");

    expect(groupBy).not.toHaveBeenCalled();
  });
});

describe("upcoming and past", () => {
  it("splits on the end date when there is one, the start date otherwise", async () => {
    // An event that started this morning and runs until tonight is still
    // something you can attend.
    findMany.mockResolvedValue([
      row({
        id: "evt-1",
        slug: "running-now",
        startsAt: new Date(Date.now() - 2 * HOUR),
        endsAt: new Date(Date.now() + 2 * HOUR),
      }),
      row({
        id: "evt-2",
        slug: "finished",
        startsAt: new Date(Date.now() - 48 * HOUR),
        endsAt: new Date(Date.now() - 24 * HOUR),
      }),
    ]);

    const { upcoming, past } = await getPublishedEvents("en");

    expect(upcoming.map((e) => e.slug)).toEqual(["running-now"]);
    expect(past.map((e) => e.slug)).toEqual(["finished"]);
  });
});

describe("when the database is unreachable", () => {
  it("degrades to no events rather than failing the page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findMany.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("simulated P1001", {
        code: "P1001",
        clientVersion: "5.20.0",
      }),
    );

    await expect(getPublishedEvents("en")).resolves.toEqual({
      upcoming: [],
      past: [],
    });
  });
});
