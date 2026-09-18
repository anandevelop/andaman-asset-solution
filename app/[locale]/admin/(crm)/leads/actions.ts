"use server";

/**
 * app/[locale]/admin/leads/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server actions for the lead pipeline. Prisma is called directly — a
 * separate REST layer would only re-implement the authorisation and
 * validation that already have to live here.
 *
 * SALES-role scoping: a SALES user may only act on a lead that is
 * unassigned or already assigned to them, and may only assign a lead to
 * themselves (never to a different rep, and never reach into another
 * rep's pipeline to reassign it away). `Role.SALES` alone (via
 * requireAdminAction's rank check) cannot express that — it only proves
 * "at least a sales rep", not "this particular row is theirs" — so every
 * action below re-checks ownership explicitly for that role. EDITOR and
 * above are unrestricted, matching how the leads table already worked
 * before SALES existed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { LeadStatus, Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
// Capability rather than rank — EDITOR outranks SALES, so a rank check
// here would let a content editor act on customer records. See
// lib/permissions.ts.
import { requireAdminAction, requireCapabilityAction } from "@/lib/admin/guard";
import { intlLocale } from "@/lib/format";
import {
  leadAssignSchema,
  leadFollowUpSchema,
  leadHousePreferenceSchema,
  leadNoteSchema,
} from "@/lib/validations";

/**
 * Writes the system-generated timeline entry a status/assignment/follow-up/
 * house-preference change produces — see LeadNoteKind.SYSTEM's comment in
 * schema.prisma for why this exists instead of reading AuditLog: only the
 * action performing the write knows the *new* value, and AuditLog never
 * stores it. Text is baked in at write time, in the acting admin's own
 * locale — the same way a human-typed note is permanently in whatever
 * language they typed it in; this is not a new inconsistency.
 *
 * Logging never fails the write it describes — same rule audit logging
 * follows (lib/audit/extension.ts): the field change is already committed
 * by the time this runs, so a failure here is swallowed rather than
 * reported as if the actual save had failed.
 */
async function writeSystemNote(leadId: string, authorId: string, body: string): Promise<void> {
  try {
    await prisma.leadNote.create({ data: { leadId, authorId, body, kind: "SYSTEM" } });
  } catch (error) {
    console.error("[leads] failed to write a system timeline entry", error);
  }
}

const updateStatusSchema = z.object({
  id: z.string().min(1),
  status: z.nativeEnum(LeadStatus),
});

export type ActionResult = { ok: true } | { ok: false; error: string };

/** True once for every action below: can this SALES user touch this row? */
async function salesMayTouch(userId: string, leadId: string): Promise<boolean> {
  const lead = await prisma.leadInquiry.findUnique({
    where: { id: leadId },
    select: { assignedToId: true },
  });
  if (!lead) return false;
  return lead.assignedToId === null || lead.assignedToId === userId;
}

function revalidateLead(locale: string, id: string) {
  revalidatePath(`/${locale}/admin/leads`);
  revalidatePath(`/${locale}/admin/leads/${id}`);
  revalidatePath(`/${locale}/admin`);
}

/**
 * Inline status change from the leads table. Note that leads are never
 * created or deleted here — capture is the public API's job, and deletion
 * would break the PDPA consent audit trail.
 */
export async function updateLeadStatus(
  locale: string,
  id: string,
  status: string,
): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  if (session.role === Role.SALES && !(await salesMayTouch(session.id, parsed.data.id))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  // Read before writing: Prisma's update() returns the row *after* the
  // write, so this is the only way to tell whether the value actually
  // changed — a rep re-selecting the option already showing must not spam
  // the timeline with a no-op "status changed" entry.
  const before = await prisma.leadInquiry.findUnique({
    where: { id: parsed.data.id },
    select: { status: true },
  });

  try {
    await prisma.leadInquiry.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  if (before && before.status !== parsed.data.status) {
    const t = await getTranslations({ locale, namespace: "admin" });
    await writeSystemNote(
      parsed.data.id,
      session.id,
      t("leadDetail.timeline.system.statusChanged", {
        status: t(`leadStatus.${parsed.data.status}` as never),
      }),
    );
  }

  revalidateLead(locale, parsed.data.id);

  return { ok: true };
}

/**
 * Assign a lead to a rep, or clear the assignment (empty string ⇒
 * unassigned). A SALES caller may only claim an unassigned lead for
 * themselves, or release/keep one already theirs — see salesMayTouch and
 * the file header.
 */
export async function assignLead(
  locale: string,
  id: string,
  assignedToId: string,
): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = leadAssignSchema.safeParse({ id, assignedToId });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  const nextAssignee = parsed.data.assignedToId ? parsed.data.assignedToId : null;

  if (session.role === Role.SALES) {
    const mayTouch = await salesMayTouch(session.id, parsed.data.id);
    const targetIsSelfOrNone = nextAssignee === null || nextAssignee === session.id;
    if (!mayTouch || !targetIsSelfOrNone) return { ok: false, error: "FORBIDDEN" };
  }

  const before = await prisma.leadInquiry.findUnique({
    where: { id: parsed.data.id },
    select: { assignedToId: true },
  });

  try {
    await prisma.leadInquiry.update({
      where: { id: parsed.data.id },
      data: { assignedToId: nextAssignee },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  if (before && before.assignedToId !== nextAssignee) {
    const t = await getTranslations({ locale, namespace: "admin" });
    const body = nextAssignee
      ? t("leadDetail.timeline.system.assignedTo", {
          // A name lookup rather than trusting the <select>'s label text,
          // which the client could in principle have tampered with —
          // this note is a permanent record, not a UI echo.
          name:
            (await prisma.user.findUnique({ where: { id: nextAssignee }, select: { name: true } }))
              ?.name ?? nextAssignee,
        })
      : t("leadDetail.timeline.system.unassigned");
    await writeSystemNote(parsed.data.id, session.id, body);
  }

  revalidateLead(locale, parsed.data.id);

  return { ok: true };
}

/** Set or clear the next-contact date. Empty string clears it. */
export async function setLeadFollowUp(
  locale: string,
  id: string,
  followUpAt: string,
): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = leadFollowUpSchema.safeParse({ id, followUpAt });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  if (session.role === Role.SALES && !(await salesMayTouch(session.id, parsed.data.id))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const parsedDate = parsed.data.followUpAt ? new Date(parsed.data.followUpAt) : null;
  if (parsedDate && Number.isNaN(parsedDate.getTime())) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  const before = await prisma.leadInquiry.findUnique({
    where: { id: parsed.data.id },
    select: { followUpAt: true },
  });

  try {
    await prisma.leadInquiry.update({
      where: { id: parsed.data.id },
      data: { followUpAt: parsedDate },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  const beforeTime = before?.followUpAt?.getTime() ?? null;
  const afterTime = parsedDate?.getTime() ?? null;
  if (before && beforeTime !== afterTime) {
    const t = await getTranslations({ locale, namespace: "admin" });
    const body = parsedDate
      ? t("leadDetail.timeline.system.followUpSet", {
          date: new Intl.DateTimeFormat(intlLocale(locale), {
            day: "numeric",
            month: "short",
            year: "numeric",
          }).format(parsedDate),
        })
      : t("leadDetail.timeline.system.followUpCleared");
    await writeSystemNote(parsed.data.id, session.id, body);
  }

  revalidateLead(locale, parsed.data.id);

  return { ok: true };
}

/**
 * Append a timestamped entry to a lead's activity timeline — a plain
 * note, a call log (with an optional duration), or an email log. Booking
 * a viewing does not go through here at all: that creates a real
 * Appointment (see app/[locale]/admin/appointments/actions.ts), which the
 * timeline reads directly rather than through a LeadNote proxy.
 */
export async function addLeadNote(
  locale: string,
  leadId: string,
  body: string,
  kind?: string,
  durationSeconds?: number,
): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = leadNoteSchema.safeParse({ leadId, body, kind, durationSeconds });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  if (session.role === Role.SALES && !(await salesMayTouch(session.id, parsed.data.leadId))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  try {
    await prisma.leadNote.create({
      data: {
        leadId: parsed.data.leadId,
        authorId: session.id,
        body: parsed.data.body,
        kind: parsed.data.kind ?? "NOTE",
        // Only a CALL entry ever carries a duration — dropped for every
        // other kind even if one somehow arrived on the request.
        durationSeconds: parsed.data.kind === "CALL" ? (parsed.data.durationSeconds ?? null) : null,
      },
    });
  } catch {
    return { ok: false, error: "CREATE_FAILED" };
  }

  revalidateLead(locale, parsed.data.leadId);

  return { ok: true };
}

/** Set or clear the free-text house preference. Empty string clears it —
 *  same convention as setLeadFollowUp above. */
export async function setHousePreference(
  locale: string,
  id: string,
  housePreference: string,
): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = leadHousePreferenceSchema.safeParse({ id, housePreference });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  if (session.role === Role.SALES && !(await salesMayTouch(session.id, parsed.data.id))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const nextValue = parsed.data.housePreference || null;

  const before = await prisma.leadInquiry.findUnique({
    where: { id: parsed.data.id },
    select: { housePreference: true },
  });

  try {
    await prisma.leadInquiry.update({
      where: { id: parsed.data.id },
      data: { housePreference: nextValue },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  if (before && before.housePreference !== nextValue) {
    const t = await getTranslations({ locale, namespace: "admin" });
    const body = nextValue
      ? t("leadDetail.timeline.system.housePreferenceSet", { value: nextValue })
      : t("leadDetail.timeline.system.housePreferenceCleared");
    await writeSystemNote(parsed.data.id, session.id, body);
  }

  revalidateLead(locale, parsed.data.id);

  return { ok: true };
}

const reserveUnitSchema = z.object({
  leadId: z.string().min(1),
  unitId: z.string().min(1),
  expiresAt: z.string().trim().max(32).optional().or(z.literal("")),
});

/**
 * A minimal stand-in for the full Units & Site Plan reservation workflow
 * (not yet built): lets a rep hold one of the lead's own project's units
 * against this lead, with an optional target date. Deliberately narrow —
 * no site-plan picker, no "mark as sold" here, just enough for the Lead
 * Detail page to show and set what LeadDetail.dc.html calls "ยูนิตที่คุยอยู่".
 *
 * The expiry date is a reminder, not an enforced release — same honest
 * framing as scheduledPublishAt on the content-workflow models (see the
 * field's own comment in schema.prisma): there is no scheduler in this
 * app, so nothing will silently free the unit when the date passes.
 */
export async function reserveUnitForLead(
  locale: string,
  leadId: string,
  unitId: string,
  expiresAt: string,
): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = reserveUnitSchema.safeParse({ leadId, unitId, expiresAt });
  if (!parsed.success) return { ok: false, error: "INVALID_INPUT" };

  if (session.role === Role.SALES && !(await salesMayTouch(session.id, parsed.data.leadId))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const lead = await prisma.leadInquiry.findUnique({
    where: { id: parsed.data.leadId },
    select: { projectId: true },
  });
  if (!lead) return { ok: false, error: "NOT_FOUND" };

  const unit = await prisma.projectUnit.findUnique({
    where: { id: parsed.data.unitId },
    select: { projectId: true, unitNumber: true, status: true, reservedByLeadId: true },
  });
  // Must belong to the same project as the lead — reserving a unit from an
  // unrelated development is never a legitimate request, whatever the
  // client sent.
  if (!unit || unit.projectId !== lead.projectId) return { ok: false, error: "INVALID_UNIT" };
  // Reservable if free, or already held for this exact lead — the latter
  // is what lets "extend the date" reuse this same action instead of
  // needing a release-then-reserve round trip.
  if (unit.status !== "AVAILABLE" && unit.reservedByLeadId !== parsed.data.leadId) {
    return { ok: false, error: "UNIT_UNAVAILABLE" };
  }

  const parsedDate = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (parsedDate && Number.isNaN(parsedDate.getTime())) {
    return { ok: false, error: "INVALID_INPUT" };
  }

  try {
    await prisma.projectUnit.update({
      where: { id: parsed.data.unitId },
      data: {
        status: "RESERVED",
        reservedByLeadId: parsed.data.leadId,
        reservedById: session.id,
        reservationExpiresAt: parsedDate,
      },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  const t = await getTranslations({ locale, namespace: "admin" });
  const body = parsedDate
    ? t("leadDetail.timeline.system.unitReserved", {
        unit: unit.unitNumber,
        date: new Intl.DateTimeFormat(intlLocale(locale), {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(parsedDate),
      })
    : t("leadDetail.timeline.system.unitReservedNoExpiry", { unit: unit.unitNumber });
  await writeSystemNote(parsed.data.leadId, session.id, body);

  revalidateLead(locale, parsed.data.leadId);

  return { ok: true };
}

/** Frees a unit this lead was holding — status back to AVAILABLE, the
 *  reservation cleared entirely. No-op-safe: returns NOT_FOUND rather than
 *  silently succeeding if the unit isn't actually held by this lead any
 *  more (someone else may have already released or sold it). */
export async function releaseUnitReservation(
  locale: string,
  leadId: string,
  unitId: string,
): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  if (!leadId || !unitId) return { ok: false, error: "INVALID_INPUT" };

  if (session.role === Role.SALES && !(await salesMayTouch(session.id, leadId))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const unit = await prisma.projectUnit.findUnique({
    where: { id: unitId },
    select: { unitNumber: true, reservedByLeadId: true },
  });
  if (!unit || unit.reservedByLeadId !== leadId) return { ok: false, error: "NOT_FOUND" };

  try {
    await prisma.projectUnit.update({
      where: { id: unitId },
      data: { status: "AVAILABLE", reservedByLeadId: null, reservedById: null, reservationExpiresAt: null },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  const t = await getTranslations({ locale, namespace: "admin" });
  await writeSystemNote(
    leadId,
    session.id,
    t("leadDetail.timeline.system.unitReleased", { unit: unit.unitNumber }),
  );

  revalidateLead(locale, leadId);

  return { ok: true };
}
