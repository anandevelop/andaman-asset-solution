"use server";

/**
 * app/[locale]/admin/appointments/actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Server actions for the appointments calendar.
 *
 * SALES-role scoping mirrors leads/actions.ts exactly, for the same
 * reason: Role.SALES alone only proves "at least a sales rep", not "this
 * particular appointment is theirs". A SALES session may create an
 * appointment for themselves, change the status or reschedule one already
 * assigned to them (or still unassigned), and claim an unassigned one —
 * but never reassign an appointment away from another rep or onto anyone
 * but themselves. EDITOR and above are unrestricted, matching how the
 * unassigned queue needs a dispatcher who isn't necessarily on the sales
 * team to be able to assign it to someone else.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
// Capability rather than rank — EDITOR outranks SALES, so a rank check
// here would let a content editor act on customer records. See
// lib/permissions.ts.
import { requireAdminAction, requireCapabilityAction } from "@/lib/admin/guard";
import {
  appointmentAssignSchema,
  appointmentRescheduleSchema,
  appointmentSchema,
  appointmentStatusSchema,
} from "@/lib/validations";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function salesMayTouch(userId: string, appointmentId: string): Promise<boolean> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { assignedToId: true },
  });
  if (!appointment) return false;
  return appointment.assignedToId === null || appointment.assignedToId === userId;
}

function revalidateAppointments(locale: string) {
  revalidatePath(`/${locale}/admin/appointments`);
}

export async function createAppointment(locale: string, input: unknown): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "VALIDATION_FAILED" };

  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) return { ok: false, error: "INVALID_DATE" };

  const requestedAssignee = parsed.data.assignedToId || null;

  // A SALES rep booking an appointment can only book it for themselves —
  // creating one and immediately handing it to a colleague is exactly the
  // reassignment assignAppointment below refuses, just via a different
  // action.
  const assignedToId =
    session.role === Role.SALES ? session.id : requestedAssignee;

  try {
    await prisma.appointment.create({
      data: {
        leadId: parsed.data.leadId || null,
        projectId: parsed.data.projectId || null,
        assignedToId,
        scheduledAt,
        durationMinutes: parsed.data.durationMinutes,
        location: parsed.data.location || null,
        notes: parsed.data.notes || null,
        createdBy: session.id,
      },
    });
  } catch {
    return { ok: false, error: "CREATE_FAILED" };
  }

  revalidateAppointments(locale);
  return { ok: true };
}

export async function updateAppointmentStatus(locale: string, input: unknown): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = appointmentStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "VALIDATION_FAILED" };

  if (session.role === Role.SALES && !(await salesMayTouch(session.id, parsed.data.id))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  try {
    await prisma.appointment.update({
      where: { id: parsed.data.id },
      data: { status: parsed.data.status },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  revalidateAppointments(locale);
  return { ok: true };
}

export async function assignAppointment(locale: string, input: unknown): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = appointmentAssignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "VALIDATION_FAILED" };

  const nextAssignee = parsed.data.assignedToId ? parsed.data.assignedToId : null;

  if (session.role === Role.SALES) {
    const mayTouch = await salesMayTouch(session.id, parsed.data.id);
    const targetIsSelfOrNone = nextAssignee === null || nextAssignee === session.id;
    if (!mayTouch || !targetIsSelfOrNone) return { ok: false, error: "FORBIDDEN" };
  }

  try {
    await prisma.appointment.update({
      where: { id: parsed.data.id },
      data: { assignedToId: nextAssignee },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  revalidateAppointments(locale);
  return { ok: true };
}

export async function rescheduleAppointment(locale: string, input: unknown): Promise<ActionResult> {
  const session = await requireCapabilityAction("viewAllLeads");

  const parsed = appointmentRescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "VALIDATION_FAILED" };

  if (session.role === Role.SALES && !(await salesMayTouch(session.id, parsed.data.id))) {
    return { ok: false, error: "FORBIDDEN" };
  }

  const scheduledAt = new Date(parsed.data.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) return { ok: false, error: "INVALID_DATE" };

  try {
    await prisma.appointment.update({
      where: { id: parsed.data.id },
      // Moving a date back to REQUESTED when it slips would be presuming
      // too much — a same-day time nudge is not the same event as a
      // customer no-show, so status is left exactly as it was.
      data: { scheduledAt },
    });
  } catch {
    return { ok: false, error: "UPDATE_FAILED" };
  }

  revalidateAppointments(locale);
  return { ok: true };
}
