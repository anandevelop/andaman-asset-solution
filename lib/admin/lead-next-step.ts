/**
 * lib/admin/lead-next-step.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "ขั้นถัดไปที่แนะนำ" — the one thing the lead drawer suggests doing next.
 *
 * Rules, not a model. The v4 mockup draws this card as AI; until there is a
 * scoring source to stand behind that, the suggestion is the first rule
 * below that applies, and every rule is something a sales manager would
 * say out loud. Ordered by what goes wrong soonest if it is left:
 *
 *   1. nobody owns the lead            → take it and call within the hour
 *   2. a viewing is past and unclosed  → say whether they came
 *   3. the follow-up date has passed   → follow up
 *   4. still NEW                       → first call
 *   5. a viewing is booked             → get ready for it
 *   6. negotiating                     → keep the conversation moving
 *
 * WON and LOST get no card: there is no next step to suggest.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { LeadStatus } from "@prisma/client";

export type NextStepInput = {
  status: LeadStatus;
  assignedToId: string | null;
  followUpAt: Date | null;
  /** The oldest REQUESTED appointment whose time has passed. */
  overdueAppointment: { id: string; scheduledAt: Date } | null;
  /** The next REQUESTED/CONFIRMED appointment still ahead. */
  upcomingAppointment: { id: string; scheduledAt: Date } | null;
};

export type NextStep =
  | { kind: "claim" }
  | { kind: "closeAppointment"; appointmentId: string; scheduledAt: Date }
  | { kind: "followUpDue"; since: Date }
  | { kind: "firstContact" }
  | { kind: "prepareViewing"; scheduledAt: Date }
  | { kind: "keepNegotiating" };

export function nextStepFor(lead: NextStepInput, now: Date): NextStep | null {
  if (lead.status === "WON" || lead.status === "LOST") return null;

  if (!lead.assignedToId) return { kind: "claim" };

  if (lead.overdueAppointment) {
    return {
      kind: "closeAppointment",
      appointmentId: lead.overdueAppointment.id,
      scheduledAt: lead.overdueAppointment.scheduledAt,
    };
  }

  if (lead.followUpAt && lead.followUpAt.getTime() <= now.getTime()) {
    return { kind: "followUpDue", since: lead.followUpAt };
  }

  if (lead.status === "NEW") return { kind: "firstContact" };

  if (lead.upcomingAppointment) {
    return { kind: "prepareViewing", scheduledAt: lead.upcomingAppointment.scheduledAt };
  }

  if (lead.status === "NEGOTIATING") return { kind: "keepNegotiating" };

  return null;
}
