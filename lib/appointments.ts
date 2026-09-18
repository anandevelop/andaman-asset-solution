/**
 * lib/appointments.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Read side of the appointments calendar — week math plus the three
 * queries the page needs (the week's own appointments, the unassigned
 * queue, and this week's per-rep workload).
 *
 * Rendered as a day-by-day agenda rather than a pixel-positioned time
 * grid: each day is a column of cards sorted by time, not a slot at an
 * exact vertical offset. That is a deliberate simplification — a real
 * absolute-time grid earns its complexity once appointments start
 * overlapping within a day at real volume; a small sales team's calendar
 * does not need it yet, and the agenda layout shows exactly the same
 * information (day, time, customer, project, rep) without it.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { AppointmentStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeQuery } from "@/lib/db";

const DAY_MS = 24 * 60 * 60_000;

/** Monday 00:00 UTC of the week containing `date`. */
export function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** Parses `?week=YYYY-MM-DD` into that week's Monday, defaulting to the
 *  current week when absent or unparsable. */
export function parseWeekParam(value: string | undefined): Date {
  if (value) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) return mondayOf(parsed);
  }
  return mondayOf(new Date());
}

export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
}

export function toWeekParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type AppointmentCard = {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  location: string | null;
  notes: string | null;
  leadId: string | null;
  customerName: string | null;
  projectId: string | null;
  projectName: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
};

const ACTIVE_STATUSES: AppointmentStatus[] = ["REQUESTED", "CONFIRMED"];

function toCard(row: {
  id: string;
  scheduledAt: Date;
  durationMinutes: number;
  status: AppointmentStatus;
  location: string | null;
  notes: string | null;
  leadId: string | null;
  lead: { name: string } | null;
  projectId: string | null;
  project: { nameEn: string; nameTh: string } | null;
  assignedToId: string | null;
  assignedTo: { name: string } | null;
}): AppointmentCard {
  return {
    id: row.id,
    scheduledAt: row.scheduledAt,
    durationMinutes: row.durationMinutes,
    status: row.status,
    location: row.location,
    notes: row.notes,
    leadId: row.leadId,
    customerName: row.lead?.name ?? null,
    projectId: row.projectId,
    projectName: row.project ? row.project.nameEn || row.project.nameTh : null,
    assignedToId: row.assignedToId,
    assignedToName: row.assignedTo?.name ?? null,
  };
}

const CARD_SELECT = {
  id: true,
  scheduledAt: true,
  durationMinutes: true,
  status: true,
  location: true,
  notes: true,
  leadId: true,
  lead: { select: { name: true } },
  projectId: true,
  project: { select: { nameEn: true, nameTh: true } },
  assignedToId: true,
  assignedTo: { select: { name: true } },
} as const;

export async function getWeekAppointments(weekStart: Date): Promise<AppointmentCard[]> {
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
  return safeQuery(
    "getWeekAppointments",
    async () => {
      const rows = await prisma.appointment.findMany({
        where: { scheduledAt: { gte: weekStart, lt: weekEnd } },
        orderBy: { scheduledAt: "asc" },
        select: CARD_SELECT,
      });
      return rows.map(toCard);
    },
    [],
  );
}

/** Not windowed to the visible week on purpose — an unassigned appointment
 *  three weeks out is exactly the one most likely to be forgotten if it
 *  only shows up once its week happens to be on screen. */
export async function getUnassignedAppointments(): Promise<AppointmentCard[]> {
  return safeQuery(
    "getUnassignedAppointments",
    async () => {
      const rows = await prisma.appointment.findMany({
        where: { assignedToId: null, status: { in: ACTIVE_STATUSES } },
        orderBy: { scheduledAt: "asc" },
        take: 30,
        select: CARD_SELECT,
      });
      return rows.map(toCard);
    },
    [],
  );
}

/**
 * Appointments today, scoped for the mobile "my day" queue (/admin/m):
 * mine or unassigned, active status. Scoped to the caller regardless of
 * role — this is a personal work queue, not a management view, so an
 * EDITOR/ADMIN account opening the mobile view sees their own day, not
 * the whole team's.
 */
export async function getMyAppointmentsToday(userId: string): Promise<AppointmentCard[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + DAY_MS);
  return safeQuery(
    "getMyAppointmentsToday",
    async () => {
      const rows = await prisma.appointment.findMany({
        where: {
          scheduledAt: { gte: start, lt: end },
          status: { in: ACTIVE_STATUSES },
          OR: [{ assignedToId: userId }, { assignedToId: null }],
        },
        orderBy: { scheduledAt: "asc" },
        select: CARD_SELECT,
      });
      return rows.map(toCard);
    },
    [],
  );
}

/**
 * Every active appointment today, across the whole team — the leadership
 * dashboard's "site visits today" card. Unlike getMyAppointmentsToday(),
 * this is not scoped to one rep: a weekly ops meeting needs the whole
 * day's schedule, not one person's slice of it.
 */
export async function getTodayAppointmentsCompanyWide(): Promise<AppointmentCard[]> {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const end = new Date(start.getTime() + DAY_MS);
  return safeQuery(
    "getTodayAppointmentsCompanyWide",
    async () => {
      const rows = await prisma.appointment.findMany({
        where: { scheduledAt: { gte: start, lt: end }, status: { in: ACTIVE_STATUSES } },
        orderBy: { scheduledAt: "asc" },
        select: CARD_SELECT,
      });
      return rows.map(toCard);
    },
    [],
  );
}

export type WorkloadRow = { id: string; name: string; count: number };

export async function getTeamWorkload(weekStart: Date): Promise<WorkloadRow[]> {
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
  return safeQuery(
    "getTeamWorkload",
    async () => {
      const [salesPeople, appointments] = await Promise.all([
        prisma.user.findMany({
          where: { salesPersonId: { not: null } },
          select: { id: true, name: true },
        }),
        prisma.appointment.findMany({
          where: {
            scheduledAt: { gte: weekStart, lt: weekEnd },
            status: { in: ACTIVE_STATUSES },
            assignedToId: { not: null },
          },
          select: { assignedToId: true },
        }),
      ]);

      const counts = new Map<string, number>();
      for (const a of appointments) {
        if (!a.assignedToId) continue;
        counts.set(a.assignedToId, (counts.get(a.assignedToId) ?? 0) + 1);
      }

      return salesPeople
        .map((u) => ({ id: u.id, name: u.name, count: counts.get(u.id) ?? 0 }))
        .sort((a, b) => b.count - a.count);
    },
    [],
  );
}
