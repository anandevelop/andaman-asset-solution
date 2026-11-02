/**
 * tests/backup-status.test.ts
 *
 * The row scripts/backup-db.sh writes after every run, read back as the
 * state the system page and the morning alert act on.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: { siteSetting: { findUnique: async () => null } } }));

import { backupStatusFrom } from "@/lib/backup-status";

const NOW = new Date("2026-11-04T03:00:00Z");
const run = (over: Record<string, unknown>) =>
  JSON.stringify({ at: "2026-11-03T19:30:05Z", ok: true, size: "1.2M", tables: 52, uploaded: true, ...over });

describe("backupStatusFrom", () => {
  it("is never when no run has reported", () => {
    expect(backupStatusFrom(null, NOW).state).toBe("never");
    expect(backupStatusFrom("not json", NOW).state).toBe("never");
  });

  it("is ok after last night's run, and knows whether it left the droplet", () => {
    const status = backupStatusFrom(run({}), NOW);
    expect(status.state).toBe("ok");
    expect(status.state !== "never" && status.offsite).toBe(true);
    const local = backupStatusFrom(run({ uploaded: false }), NOW);
    expect(local.state !== "never" && local.offsite).toBe(false);
  });

  it("is stale once a night has been missed", () => {
    expect(backupStatusFrom(run({ at: "2026-11-02T14:00:00Z" }), NOW).state).toBe("stale");
  });

  it("is failed when the last run said so, however recent", () => {
    expect(backupStatusFrom(run({ ok: false, detail: "backup failed" }), NOW).state).toBe("failed");
  });
});
