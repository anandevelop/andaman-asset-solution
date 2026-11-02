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
function lastSaved(): Record<string, { email: boolean; inApp: boolean; line: boolean }> {
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

  it("has nothing waiting on a scheduler: the cron service runs the timed ones", () => {
    expect(NOTIFICATION_EVENTS.filter((e) => e.needsScheduler)).toEqual([]);
  });

  it("offers LINE only for the events the sales team acts on", () => {
    expect(NOTIFICATION_EVENTS.filter((e) => e.channels.includes("line")).map((e) => e.key)).toEqual([
      "newLead",
      "unclaimedLead",
      "eventRegistration",
      "reservationExpiring",
      "weeklySummary",
    ]);
  });
});

describe("saveNotificationPrefs", () => {
  it("stores the timed events now that they can be sent", async () => {
    await saveNotificationPrefs({
      unclaimedLead: { email: true, inApp: true, line: true },
      weeklySummary: { email: true, inApp: false, line: false },
    });

    const saved = lastSaved();
    expect(saved.unclaimedLead).toEqual({ email: true, inApp: true, line: true });
    expect(saved.weeklySummary).toEqual({ email: true, inApp: false, line: false });
  });

  it("never stores LINE for an event that has no LINE channel", async () => {
    await saveNotificationPrefs({ failedLogins: { email: true, inApp: true, line: true } });
    expect(lastSaved().failedLogins).toEqual({ email: true, inApp: true, line: false });
  });

  it("keeps the switches for events that can actually be sent", async () => {
    await saveNotificationPrefs({
      newLead: { email: true, inApp: false, line: true },
      failedLogins: { email: false, inApp: true, line: false },
    });

    const saved = lastSaved();
    expect(saved.newLead).toEqual({ email: true, inApp: false, line: true });
    expect(saved.failedLogins).toEqual({ email: false, inApp: true, line: false });
  });

  it("drops a key that is not an event", async () => {
    await saveNotificationPrefs({
      newLead: { email: true, inApp: true, line: true },
      "../../etc/passwd": { email: true, inApp: true, line: true },
    } as never);

    expect(Object.keys(lastSaved()).sort()).toEqual(
      NOTIFICATION_EVENTS.map((event) => event.key).sort(),
    );
  });

  it("writes every event, so a missing one is off rather than absent", async () => {
    await saveNotificationPrefs({});

    const saved = lastSaved();
    for (const event of NOTIFICATION_EVENTS) {
      expect(saved[event.key], event.key).toEqual({ email: false, inApp: false, line: false });
    }
  });
});

describe("defaultNotificationPrefs", () => {
  it("keeps LINE on for new leads and sign-ups, as before the switch existed", () => {
    const defaults = defaultNotificationPrefs();
    expect(defaults.newLead.line).toBe(true);
    expect(defaults.eventRegistration.line).toBe(true);
  });

  it("starts the timed alerts in the bell and LINE, not the inbox", () => {
    const defaults = defaultNotificationPrefs();
    expect(defaults.unclaimedLead).toEqual({ email: false, inApp: true, line: true });
    expect(defaults.reservationExpiring).toEqual({ email: false, inApp: true, line: true });
    expect(defaults.weeklySummary).toEqual({ email: true, inApp: true, line: false });
  });
});
