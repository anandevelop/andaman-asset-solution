/**
 * tests/admin/lead-next-step.test.ts — the drawer's rule-based suggestion
 * (lib/admin/lead-next-step.ts). Order matters more than any single rule:
 * each case below has a later rule also true, and checks the earlier wins.
 */

import { describe, expect, it } from "vitest";
import { nextStepFor, type NextStepInput } from "@/lib/admin/lead-next-step";

const now = new Date("2026-09-30T10:00:00.000Z");
const past = new Date("2026-09-29T10:00:00.000Z");
const future = new Date("2026-10-02T10:00:00.000Z");

const lead = (patch: Partial<NextStepInput>): NextStepInput => ({
  status: "CONTACTED",
  assignedToId: "rep",
  followUpAt: null,
  overdueAppointment: null,
  upcomingAppointment: null,
  ...patch,
});

describe("nextStepFor", () => {
  it("asks someone to take an unowned lead before anything else", () => {
    expect(
      nextStepFor(lead({ assignedToId: null, status: "NEW", overdueAppointment: { id: "a", scheduledAt: past } }), now),
    ).toEqual({ kind: "claim" });
  });

  it("closes a past viewing before chasing a follow-up", () => {
    expect(nextStepFor(lead({ overdueAppointment: { id: "a", scheduledAt: past }, followUpAt: past }), now)).toEqual({
      kind: "closeAppointment",
      appointmentId: "a",
      scheduledAt: past,
    });
  });

  it("flags a follow-up date that has arrived", () => {
    expect(nextStepFor(lead({ followUpAt: past, status: "NEW" }), now)).toEqual({ kind: "followUpDue", since: past });
  });

  it("does not flag a follow-up that is still ahead", () => {
    expect(nextStepFor(lead({ followUpAt: future }), now)).toBeNull();
  });

  it("suggests the first call for an owned NEW lead", () => {
    expect(nextStepFor(lead({ status: "NEW" }), now)).toEqual({ kind: "firstContact" });
  });

  it("points at an upcoming viewing", () => {
    expect(
      nextStepFor(lead({ status: "VIEWING_SCHEDULED", upcomingAppointment: { id: "b", scheduledAt: future } }), now),
    ).toEqual({ kind: "prepareViewing", scheduledAt: future });
  });

  it("keeps a negotiation moving", () => {
    expect(nextStepFor(lead({ status: "NEGOTIATING" }), now)).toEqual({ kind: "keepNegotiating" });
  });

  it("has nothing to suggest for a closed lead", () => {
    expect(nextStepFor(lead({ status: "WON", assignedToId: null }), now)).toBeNull();
    expect(nextStepFor(lead({ status: "LOST", followUpAt: past }), now)).toBeNull();
  });
});
