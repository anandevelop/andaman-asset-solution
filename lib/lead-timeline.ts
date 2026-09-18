import "server-only";

/**
 * lib/lead-timeline.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The Lead Detail page's unified activity feed (LeadDetail.dc.html) —
 * every note, call, email log, system-recorded field change, booked
 * appointment, and the lead's own arrival, merged into one chronological
 * list.
 *
 * Field changes (status/assignment/follow-up/house preference) come from
 * LeadNote rows of kind SYSTEM, written by the actions in leads/actions.ts
 * at the moment they make the change — not from AuditLog. AuditLog
 * (lib/audit/extension.ts) only ever stores which field *names* a write
 * touched, never the values, by design ("names, not contents"), so it can
 * never answer "changed to what" no matter how this file reads it. Only
 * the action performing the write knows the new value, which is exactly
 * why it writes the SYSTEM note itself rather than this file trying to
 * reconstruct one afterwards. See LeadNoteKind.SYSTEM's comment in
 * schema.prisma.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

export type LeadTimelineEntry =
  | { id: string; at: Date; kind: "NOTE" | "EMAIL"; body: string; authorName: string | null }
  | {
      id: string;
      at: Date;
      kind: "CALL";
      body: string;
      authorName: string | null;
      durationSeconds: number | null;
    }
  | { id: string; at: Date; kind: "SYSTEM"; body: string; authorName: string | null }
  | {
      id: string;
      at: Date;
      kind: "APPOINTMENT_CREATED";
      scheduledAt: Date;
      project: { nameEn: string; nameTh: string } | null;
      assigneeName: string | null;
    }
  | { id: string; at: Date; kind: "ENTERED_SYSTEM"; source: string; sourcePath: string | null };

export async function getLeadTimeline(leadId: string): Promise<LeadTimelineEntry[]> {
  const lead = await safeQuery(
    "leadTimeline:lead",
    () =>
      prisma.leadInquiry.findUnique({
        where: { id: leadId },
        select: { createdAt: true, source: true, sourcePath: true },
      }),
    null,
  );

  const [notes, appointments] = await Promise.all([
    safeQuery(
      "leadTimeline:notes",
      () =>
        prisma.leadNote.findMany({
          where: { leadId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            body: true,
            kind: true,
            durationSeconds: true,
            createdAt: true,
            author: { select: { name: true } },
          },
        }),
      [],
    ),
    safeQuery(
      "leadTimeline:appointments",
      () =>
        prisma.appointment.findMany({
          where: { leadId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            scheduledAt: true,
            createdAt: true,
            project: { select: { nameEn: true, nameTh: true } },
            assignedTo: { select: { name: true } },
          },
        }),
      [],
    ),
  ]);

  const entries: LeadTimelineEntry[] = [];

  for (const note of notes) {
    if (note.kind === "CALL") {
      entries.push({
        id: note.id,
        at: note.createdAt,
        kind: "CALL",
        body: note.body,
        authorName: note.author?.name ?? null,
        durationSeconds: note.durationSeconds,
      });
    } else if (note.kind === "SYSTEM") {
      entries.push({
        id: note.id,
        at: note.createdAt,
        kind: "SYSTEM",
        body: note.body,
        authorName: note.author?.name ?? null,
      });
    } else {
      entries.push({
        id: note.id,
        at: note.createdAt,
        kind: note.kind === "EMAIL" ? "EMAIL" : "NOTE",
        body: note.body,
        authorName: note.author?.name ?? null,
      });
    }
  }

  for (const appt of appointments) {
    entries.push({
      id: appt.id,
      at: appt.createdAt,
      kind: "APPOINTMENT_CREATED",
      scheduledAt: appt.scheduledAt,
      project: appt.project,
      assigneeName: appt.assignedTo?.name ?? null,
    });
  }

  if (lead) {
    entries.push({
      id: "entered-system",
      at: lead.createdAt,
      kind: "ENTERED_SYSTEM",
      source: lead.source,
      sourcePath: lead.sourcePath,
    });
  }

  return entries.sort((a, b) => b.at.getTime() - a.at.getTime());
}
