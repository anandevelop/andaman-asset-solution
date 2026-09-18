/**
 * tests/notifications.test.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The rules that keep the notification matrix honest.
 *
 * Two of them matter enough to pin down. An event that needs a scheduler
 * must never end up stored as "on" — the settings screen renders those
 * switches disabled, but the screen is not the enforcement, this is, and a
 * hand-made request must not be able to save a preference nothing can act
 * on. And an unknown key must be dropped rather than written, so the
 * preference blob cannot become a general-purpose write target.
 *
 * The catalogue itself is checked too, because the table on the screen is
 * generated from it: a row with no capability would be sent to everybody,
 * including the roles the PDPA work deliberately keeps customer names away
 * from.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const upsert = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteSetting: {
      get upsert() {
        return upsert;
      },
      findUnique: vi.fn(async () => null),
    },
  },
}));

vi.mock("@/lib/db", () => ({
  safeQuery: async <T,>(_key: string, run: () => Promise<T>, fallback: T) => {
    try {
      return await run();
    } catch {
      return fallback;
    }
  },
}));

vi.mock("@/lib/audit/context", () => ({ withoutAudit: (run: () => unknown) => run() }));

import {
  NOTIFICATION_EVENTS,
  defaultNotificationPrefs,
  saveNotificationPrefs,
} from "@/lib/notifications";
import { CAPABILITIES } from "@/lib/permissions";

/** The preference object the last save actually wrote. */
function lastSaved(): Record<string, { email: boolean; inApp: boolean }> {
  const call = upsert.mock.calls.at(-1)?.[0] as { create: { value: string } };
  return JSON.parse(call.create.value);
}

beforeEach(() => {
  upsert.mockReset();
  upsert.mockResolvedValue({});
});

describe("the notification catalogue", () => {
  it("has the seven rows the settings screen renders", () => {
    expect(NOTIFICATION_EVENTS.map((event) => event.key)).toEqual([
      "newLead",
      "unclaimedLead",
      "eventRegistration",
      "contentInReview",
      "reservationExpiring",
      "weeklySummary",
      "failedLogins",
    ]);
  });

  it("names a real capability for every event", () => {
    // Recipients are chosen by capability. A typo here would silently mean
    // "nobody", or worse, send a customer's name to a role that is not
    // allowed to see one.
    for (const event of NOTIFICATION_EVENTS) {
      expect(CAPABILITIES, event.key).toContain(event.capability);
    }
  });

  it("defaults every scheduler-dependent event to off", () => {
    for (const event of NOTIFICATION_EVENTS.filter((e) => e.needsScheduler)) {
      expect(event.defaults, event.key).toEqual({ email: false, inApp: false });
    }
  });

  it("marks exactly the three timed events as needing a scheduler", () => {
    expect(NOTIFICATION_EVENTS.filter((e) => e.needsScheduler).map((e) => e.key)).toEqual([
      "unclaimedLead",
      "reservationExpiring",
      "weeklySummary",
    ]);
  });
});

describe("saveNotificationPrefs", () => {
  it("refuses to store an on switch for an event that needs a scheduler", async () => {
    await saveNotificationPrefs({
      unclaimedLead: { email: true, inApp: true },
      weeklySummary: { email: true, inApp: true },
    });

    const saved = lastSaved();
    expect(saved.unclaimedLead).toEqual({ email: false, inApp: false });
    expect(saved.weeklySummary).toEqual({ email: false, inApp: false });
  });

  it("keeps the switches for events that can actually be sent", async () => {
    await saveNotificationPrefs({
      newLead: { email: true, inApp: false },
      failedLogins: { email: false, inApp: true },
    });

    const saved = lastSaved();
    expect(saved.newLead).toEqual({ email: true, inApp: false });
    expect(saved.failedLogins).toEqual({ email: false, inApp: true });
  });

  it("drops a key that is not an event", async () => {
    await saveNotificationPrefs({
      newLead: { email: true, inApp: true },
      "../../etc/passwd": { email: true, inApp: true },
    } as never);

    expect(Object.keys(lastSaved()).sort()).toEqual(
      NOTIFICATION_EVENTS.map((event) => event.key).sort(),
    );
  });

  it("writes every event, so a missing one is off rather than absent", async () => {
    await saveNotificationPrefs({});

    const saved = lastSaved();
    for (const event of NOTIFICATION_EVENTS) {
      expect(saved[event.key], event.key).toEqual({ email: false, inApp: false });
    }
  });
});

describe("defaultNotificationPrefs", () => {
  it("switches on the four that work and nothing else", () => {
    const defaults = defaultNotificationPrefs();
    const on = Object.entries(defaults)
      .filter(([, channels]) => channels.email || channels.inApp)
      .map(([key]) => key);

    expect(on.sort()).toEqual(
      ["contentInReview", "eventRegistration", "failedLogins", "newLead"].sort(),
    );
  });
});
