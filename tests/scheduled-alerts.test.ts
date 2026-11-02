/**
 * tests/scheduled-alerts.test.ts
 *
 * The timed staff alerts (lib/scheduled-alerts.ts): each one goes out once,
 * old leads never flood a chat on the first run, and the Monday summary
 * waits for Monday 08:00 in Bangkok whatever timezone the server is in.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();
let leads: Array<{ id: string; name: string; createdAt: Date; project: null }> = [];
let units: Array<Record<string, unknown>> = [];

vi.mock("@/lib/prisma", () => ({
  prisma: {
    siteSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        store.has(where.key) ? { key: where.key, value: store.get(where.key)! } : null,
      upsert: async ({ where, create }: { where: { key: string }; create: { value: string } }) => {
        store.set(where.key, create.value);
      },
    },
    leadInquiry: {
      findMany: async ({ where }: { where: { createdAt: { lte: Date; gte: Date } } }) =>
        leads.filter((l) => l.createdAt <= where.createdAt.lte && l.createdAt >= where.createdAt.gte),
      count: async () => 0,
    },
    projectUnit: { findMany: async () => units, groupBy: async () => [] },
    appointment: { count: async () => 0 },
    user: { findMany: async () => [], findUnique: async () => null },
  },
}));

const alerts: string[] = [];
vi.mock("@/lib/notifications", () => ({
  isEnabled: async (_event: string, channel: string) => channel !== "email",
  notifyAdmins: async ({ title }: { title: string }) => {
    alerts.push(title);
    return 1;
  },
}));
vi.mock("@/lib/line", () => ({ pushLineAlert: async () => {} }));
vi.mock("@/lib/email", () => ({ sendStaffAlertEmail: async () => {} }));
vi.mock("@/lib/lead-routing", () => ({
  getRoutingRules: async () => ({ escalateAfterHours: 2, teamLeadUserId: null }),
}));
vi.mock("@/lib/admin/analytics", () => ({ getPageViewTrend: async () => ({ totalViews: 333 }) }));

import { runScheduledAlerts } from "@/lib/scheduled-alerts";

const HOUR = 3_600_000;
// Tuesday 4 Nov 2026, 10:00 Bangkok.
const TUESDAY = new Date("2026-11-04T03:00:00Z");

beforeEach(() => {
  store.clear();
  alerts.length = 0;
  leads = [];
  units = [];
});

describe("unclaimed leads", () => {
  it("are announced once, not every 15 minutes", async () => {
    leads = [{ id: "l1", name: "Isla Chen", createdAt: new Date(TUESDAY.getTime() - 3 * HOUR), project: null }];
    expect((await runScheduledAlerts(TUESDAY)).unclaimed).toBe(1);
    expect((await runScheduledAlerts(new Date(TUESDAY.getTime() + 15 * 60_000))).unclaimed).toBe(0);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("Isla Chen");
  });

  it("wait for the routing rules' hours", async () => {
    leads = [{ id: "l2", name: "Too new", createdAt: new Date(TUESDAY.getTime() - 1 * HOUR), project: null }];
    expect((await runScheduledAlerts(TUESDAY)).unclaimed).toBe(0);
  });

  it("older than two weeks are left alone", async () => {
    leads = [{ id: "l3", name: "Stale", createdAt: new Date(TUESDAY.getTime() - 20 * 24 * HOUR), project: null }];
    expect((await runScheduledAlerts(TUESDAY)).unclaimed).toBe(0);
  });
});

describe("reservations", () => {
  const unit = (expires: Date) => ({
    id: "u1",
    unitNumber: "A8",
    reservationExpiresAt: expires,
    project: { id: "p1", nameEn: "The Trinity Village", nameTh: null },
    reservedByLead: null,
  });

  it("are announced once per expiry date, and again if the date moves", async () => {
    units = [unit(new Date(TUESDAY.getTime() + 24 * HOUR))];
    expect((await runScheduledAlerts(TUESDAY)).reservations).toBe(1);
    expect((await runScheduledAlerts(TUESDAY)).reservations).toBe(0);
    units = [unit(new Date(TUESDAY.getTime() + 36 * HOUR))];
    expect((await runScheduledAlerts(TUESDAY)).reservations).toBe(1);
  });
});

describe("weekly summary", () => {
  it("waits for Monday 08:00 Bangkok, then goes once", async () => {
    expect((await runScheduledAlerts(TUESDAY)).weekly).toBe(0);
    // Monday 9 Nov 2026, 07:45 Bangkok.
    expect((await runScheduledAlerts(new Date("2026-11-09T00:45:00Z"))).weekly).toBe(0);
    // 08:00 Bangkok.
    expect((await runScheduledAlerts(new Date("2026-11-09T01:00:00Z"))).weekly).toBe(1);
    expect((await runScheduledAlerts(new Date("2026-11-09T01:15:00Z"))).weekly).toBe(0);
  });
});
