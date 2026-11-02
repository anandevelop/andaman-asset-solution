/**
 * lib/scheduled-alerts.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The three notifications that are about time passing rather than about
 * something happening:
 *
 *   unclaimedLead        a NEW lead nobody has taken after the routing
 *                        rules' escalateAfterHours (2 h by default)
 *   reservationExpiring  a RESERVED unit whose reservationExpiresAt is in
 *                        the next 48 hours (or passed in the last 24)
 *   weeklySummary        Monday from 08:00 Bangkok, last week's figures
 *
 * Run every 15 minutes by the `cron` service (scripts/cron.mjs →
 * POST /api/cron/alerts). Each channel obeys its switch on
 * /admin/settings/notifications.
 *
 * ONCE EACH
 *
 * What has been sent is remembered in one site_settings row: a map of
 * alert key → when. The reservation key includes the expiry date, so
 * moving the date arms a fresh alert; a lead is alerted about once, ever.
 * Entries older than 60 days are dropped. A failed send is still marked
 * sent: retrying every 15 minutes would flood a chat over one outage.
 *
 * NO BACKLOG FLOOD
 *
 * Leads older than 14 days are never alerted about (the first run after
 * this shipped would otherwise announce every stale test lead), and one
 * run sends at most 10 alerts of each kind.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { LeadStatus, Role, UnitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Capability } from "@/lib/permissions";
import { getRoutingRules } from "@/lib/lead-routing";
import { isEnabled, notifyAdmins } from "@/lib/notifications";
import { pushLineAlert } from "@/lib/line";
import { sendStaffAlertEmail } from "@/lib/email";
import { getPageViewTrend } from "@/lib/admin/analytics";

const SENT_KEY = "scheduledAlerts.sent";
const KEEP_DAYS = 60;
const MAX_PER_RUN = 10;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TZ = "Asia/Bangkok";

// ── Sent log ────────────────────────────────────────────────────────────

async function readSent(): Promise<Record<string, string>> {
  const row = await prisma.siteSetting.findUnique({ where: { key: SENT_KEY } });
  if (!row) return {};
  try {
    const value = JSON.parse(row.value);
    return value && typeof value === "object" ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function writeSent(sent: Record<string, string>): Promise<void> {
  const cutoff = Date.now() - KEEP_DAYS * DAY;
  const kept = Object.fromEntries(Object.entries(sent).filter(([, at]) => Date.parse(at) >= cutoff));
  await prisma.siteSetting.upsert({
    where: { key: SENT_KEY },
    create: { key: SENT_KEY, value: JSON.stringify(kept) },
    update: { value: JSON.stringify(kept) },
  });
}

// ── Helpers ─────────────────────────────────────────────────────────────

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://andamanassetsolution.com").replace(/\/+$/, "");
}

/** Active staff who may see this kind of thing, plus the env inbox. */
async function emailRecipients(capability: Capability, extra: (string | undefined)[] = []): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { email: true, role: true },
  });
  const list = [
    ...users.filter((u) => can(u.role as Role, capability)).map((u) => u.email),
    ...extra.flatMap((e) => (e ?? "").split(",")),
  ]
    .map((e) => e?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e && e.includes("@")));
  return [...new Set(list)];
}

const thaiDateTime = (d: Date) =>
  d.toLocaleString("th-TH", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Hours, rounded down, as "5 ชม." or "2 วัน 3 ชม.". */
function age(ms: number): string {
  const hours = Math.floor(ms / HOUR);
  return hours < 24 ? `${hours} ชม.` : `${Math.floor(hours / 24)} วัน ${hours % 24} ชม.`;
}

type Channels = { inApp: boolean; email: boolean; line: boolean };

async function channels(event: string): Promise<Channels> {
  const [inApp, email, line] = await Promise.all([
    isEnabled(event, "inApp"),
    isEnabled(event, "email"),
    isEnabled(event, "line"),
  ]);
  return { inApp, email, line };
}

// ── Unclaimed leads ─────────────────────────────────────────────────────

async function unclaimedLeads(now: Date, sent: Record<string, string>): Promise<number> {
  const on = await channels("unclaimedLead");
  if (!on.inApp && !on.email && !on.line) return 0;

  const rules = await getRoutingRules();
  const afterHours = rules.escalateAfterHours || 2;

  const leads = await prisma.leadInquiry.findMany({
    where: {
      status: LeadStatus.NEW,
      assignedToId: null,
      createdAt: { lte: new Date(now.getTime() - afterHours * HOUR), gte: new Date(now.getTime() - 14 * DAY) },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: { id: true, name: true, createdAt: true, project: { select: { nameTh: true, nameEn: true } } },
  });

  const due = leads.filter((l) => !sent[`unclaimed:${l.id}`]).slice(0, MAX_PER_RUN);
  if (due.length === 0) return 0;

  const teamLead = rules.teamLeadUserId
    ? await prisma.user.findUnique({ where: { id: rules.teamLeadUserId }, select: { email: true, isActive: true } })
    : null;
  const to = on.email
    ? teamLead?.isActive
      ? [teamLead.email]
      : await emailRecipients("viewAllLeads", [process.env.LEAD_NOTIFICATION_TO_EMAIL])
    : [];

  for (const lead of due) {
    const waited = age(now.getTime() - lead.createdAt.getTime());
    const project = lead.project?.nameEn || lead.project?.nameTh || "สอบถามทั่วไป";
    const url = `${siteUrl()}/th/admin/leads?lead=${encodeURIComponent(lead.id)}`;
    const title = `ลีดยังไม่มีคนรับ ${waited}: ${lead.name}`;

    if (on.inApp) {
      await notifyAdmins({ event: "unclaimedLead", title, body: project, href: `/admin/leads?lead=${lead.id}` });
    }
    if (on.line) {
      await pushLineAlert({
        kind: "unclaimed",
        title: "⚠️ ลีดยังไม่มีคนรับ",
        rows: [
          ["ชื่อ", lead.name],
          ["สนใจ", project],
          ["เข้ามาเมื่อ", thaiDateTime(lead.createdAt)],
          ["รอมาแล้ว", waited],
        ],
        url,
        urlLabel: "รับเรื่องในหลังบ้าน",
      });
    }
    if (on.email && to.length) {
      await sendStaffAlertEmail({
        to,
        subject: title,
        heading: "ลีดยังไม่มีคนรับ",
        rows: [
          ["ชื่อ", lead.name],
          ["สนใจ", project],
          ["เข้ามาเมื่อ", thaiDateTime(lead.createdAt)],
          ["รอมาแล้ว", waited],
        ],
        url,
        urlLabel: "เปิดลีดในหลังบ้าน",
      });
    }
    sent[`unclaimed:${lead.id}`] = now.toISOString();
  }

  return due.length;
}

// ── Reservations ────────────────────────────────────────────────────────

async function expiringReservations(now: Date, sent: Record<string, string>): Promise<number> {
  const on = await channels("reservationExpiring");
  if (!on.inApp && !on.email && !on.line) return 0;

  const units = await prisma.projectUnit.findMany({
    where: {
      status: UnitStatus.RESERVED,
      reservationExpiresAt: { gte: new Date(now.getTime() - DAY), lte: new Date(now.getTime() + 2 * DAY) },
    },
    orderBy: { reservationExpiresAt: "asc" },
    take: 50,
    select: {
      id: true,
      unitNumber: true,
      reservationExpiresAt: true,
      project: { select: { id: true, nameEn: true, nameTh: true } },
      reservedByLead: { select: { id: true, name: true } },
    },
  });

  const keyOf = (u: (typeof units)[number]) => `reservation:${u.id}:${u.reservationExpiresAt!.toISOString()}`;
  const due = units.filter((u) => !sent[keyOf(u)]).slice(0, MAX_PER_RUN);
  if (due.length === 0) return 0;

  const to = on.email ? await emailRecipients("viewAllLeads", [process.env.LEAD_NOTIFICATION_TO_EMAIL]) : [];

  for (const unit of due) {
    const expires = unit.reservationExpiresAt!;
    const projectName = unit.project.nameEn || unit.project.nameTh;
    const passed = expires.getTime() <= now.getTime();
    const when = thaiDateTime(expires);
    const path = `/admin/projects/${unit.project.id}/units`;
    const title = `${passed ? "การจองหมดอายุแล้ว" : "การจองใกล้หมดอายุ"}: ${projectName} ${unit.unitNumber}`;
    const rows: [string, string][] = [
      ["โครงการ", projectName],
      ["ยูนิต", unit.unitNumber],
      ["หมดอายุ", when],
      ["ผู้จอง", unit.reservedByLead?.name ?? "—"],
    ];

    if (on.inApp) await notifyAdmins({ event: "reservationExpiring", title, body: when, href: path });
    if (on.line) {
      await pushLineAlert({
        kind: "reservation",
        title: passed ? "⏰ การจองหมดอายุแล้ว" : "⏰ การจองใกล้หมดอายุ",
        rows,
        url: `${siteUrl()}/th${path}`,
        urlLabel: "ดูยูนิตในหลังบ้าน",
      });
    }
    if (on.email && to.length) {
      await sendStaffAlertEmail({
        to,
        subject: title,
        heading: passed ? "การจองหมดอายุแล้ว" : "การจองใกล้หมดอายุ",
        rows,
        url: `${siteUrl()}/th${path}`,
        urlLabel: "ดูยูนิตในหลังบ้าน",
      });
    }
    sent[keyOf(unit)] = now.toISOString();
  }

  return due.length;
}

// ── Weekly summary ──────────────────────────────────────────────────────

/** Bangkok wall-clock parts, whatever TZ the container runs in. */
function bangkok(now: Date): { weekday: number; hour: number; ymd: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { weekday, hour: Number(parts.hour), ymd: `${parts.year}-${parts.month}-${parts.day}` };
}

async function weeklySummary(now: Date, sent: Record<string, string>): Promise<number> {
  const local = bangkok(now);
  if (local.weekday !== 1 || local.hour < 8) return 0;
  const key = `weekly:${local.ymd}`;
  if (sent[key]) return 0;

  const on = await channels("weeklySummary");
  if (!on.inApp && !on.email && !on.line) {
    sent[key] = now.toISOString();
    return 0;
  }

  const since = new Date(now.getTime() - 7 * DAY);
  const [newLeads, won, lost, unassigned, viewings, units, views] = await Promise.all([
    prisma.leadInquiry.count({ where: { createdAt: { gte: since } } }),
    prisma.leadInquiry.count({ where: { status: LeadStatus.WON, updatedAt: { gte: since } } }),
    prisma.leadInquiry.count({ where: { status: LeadStatus.LOST, updatedAt: { gte: since } } }),
    prisma.leadInquiry.count({ where: { status: LeadStatus.NEW, assignedToId: null } }),
    prisma.appointment.count({ where: { scheduledAt: { gte: since, lte: now } } }),
    prisma.projectUnit.groupBy({ by: ["status"], _count: { _all: true } }),
    getPageViewTrend(7),
  ]);
  const unitCount = (s: UnitStatus) => units.find((u) => u.status === s)?._count._all ?? 0;

  const rows: [string, string][] = [
    ["ลีดใหม่", String(newLeads)],
    ["ปิดการขาย", String(won)],
    ["ไม่สำเร็จ", String(lost)],
    ["นัดชมที่ผ่านมา", String(viewings)],
    ["ลีดค้างยังไม่มีคนรับ", String(unassigned)],
    ["ยูนิตว่าง / จอง / ขายแล้ว", `${unitCount(UnitStatus.AVAILABLE)} / ${unitCount(UnitStatus.RESERVED)} / ${unitCount(UnitStatus.SOLD) + unitCount(UnitStatus.TRANSFERRED)}`],
    ["ผู้เข้าชมเว็บ", views.totalViews.toLocaleString("en-US")],
  ];
  const title = `สรุปประจำสัปดาห์: ลีดใหม่ ${newLeads} · ปิดการขาย ${won}`;
  const url = `${siteUrl()}/th/admin`;

  if (on.inApp) await notifyAdmins({ event: "weeklySummary", title, body: rows.map((r) => r.join(" ")).join(" · "), href: "/admin" });
  if (on.line) await pushLineAlert({ kind: "weekly", title: "📊 สรุปประจำสัปดาห์", rows, url, urlLabel: "เปิดหลังบ้าน" });
  if (on.email) {
    const to = await emailRecipients("viewAuditLog", [process.env.REPORT_RECIPIENTS]);
    if (to.length) {
      await sendStaffAlertEmail({ to, subject: title, heading: "สรุปประจำสัปดาห์ (7 วันที่ผ่านมา)", rows, url, urlLabel: "เปิดหลังบ้าน" });
    }
  }
  sent[key] = now.toISOString();
  return 1;
}

// ── Entry point ─────────────────────────────────────────────────────────

export type ScheduledAlertsResult = { unclaimed: number; reservations: number; weekly: number };

export async function runScheduledAlerts(now = new Date()): Promise<ScheduledAlertsResult> {
  const sent = await readSent();
  const result: ScheduledAlertsResult = { unclaimed: 0, reservations: 0, weekly: 0 };
  try {
    result.unclaimed = await unclaimedLeads(now, sent);
    result.reservations = await expiringReservations(now, sent);
    result.weekly = await weeklySummary(now, sent);
  } finally {
    // Whatever went out is remembered, even if a later step threw.
    await writeSent(sent);
  }
  return result;
}
