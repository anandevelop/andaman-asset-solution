/**
 * lib/leads/suspect.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Holding enquiries that look like a test or spam (lib/leads/spam-signals.ts)
 * apart from the real leads, and what an admin can do with them:
 *
 *   - let it through — it becomes an ordinary lead, routed and announced
 *     as if it had just arrived (lib/leads/capture.ts),
 *   - mark it spam — deleted, and its email and phone blocked, so the same
 *     sender is quietly ignored next time,
 *   - delete it — gone, nothing blocked (the team's own test, say).
 *
 * See SuspectLead in schema.prisma for why these live in their own table.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { announceLead, type LeadNotice } from "@/lib/leads/capture";
import type { SpamSignal } from "@/lib/leads/spam-signals";

/** Held enquiries older than this are deleted unreviewed — personal data
 *  is not kept for a decision nobody is going to make. */
export const SUSPECT_RETENTION_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function isBlockedSender(email: string, phone: string): Promise<boolean> {
  const hit = await prisma.leadBlock.findFirst({
    where: {
      OR: [
        { kind: "email", value: email.trim().toLowerCase() },
        { kind: "phone", value: phone.trim() },
      ],
    },
    select: { id: true },
  });
  return hit !== null;
}

/** Enquiries (real or held) from this email or phone in the last day. */
export async function recentSubmissionCount(email: string, phone: string, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - DAY_MS);
  const who = [{ email: email.trim().toLowerCase() }, { phone: phone.trim() }];
  const [leads, held] = await Promise.all([
    prisma.leadInquiry.count({ where: { createdAt: { gte: since }, OR: who } }),
    prisma.suspectLead.count({ where: { createdAt: { gte: since }, OR: who } }),
  ]);
  return leads + held;
}

/** JSON-safe: dates become ISO strings, read back by `fromStored`. */
function toStored(data: Prisma.LeadInquiryUncheckedCreateInput): Prisma.InputJsonObject {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : (value ?? null)]),
  ) as Prisma.InputJsonObject;
}

function fromStored(stored: Prisma.JsonValue): Prisma.LeadInquiryUncheckedCreateInput {
  const data = { ...(stored as Record<string, unknown>) };
  if (typeof data.consentedAt === "string") data.consentedAt = new Date(data.consentedAt);
  return data as unknown as Prisma.LeadInquiryUncheckedCreateInput;
}

export async function holdSuspect(
  data: Prisma.LeadInquiryUncheckedCreateInput,
  notice: LeadNotice,
  reasons: readonly SpamSignal[],
): Promise<{ id: string }> {
  return prisma.suspectLead.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      message: (data.message as string | null | undefined) ?? null,
      projectId: (data.projectId as string | null | undefined) ?? null,
      reasons: [...reasons],
      input: toStored(data),
      notice: notice as unknown as Prisma.InputJsonObject,
    },
    select: { id: true },
  });
}

export type SuspectRow = {
  id: string;
  createdAt: Date;
  name: string;
  email: string;
  phone: string;
  message: string | null;
  projectName: string | null;
  reasons: string[];
};

/** The review list, newest first. Old rows are purged on the way. */
export async function listSuspects(now = new Date()): Promise<SuspectRow[]> {
  await prisma.suspectLead.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - SUSPECT_RETENTION_DAYS * DAY_MS) } },
  });
  const rows = await prisma.suspectLead.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, createdAt: true, name: true, email: true, phone: true, message: true, projectId: true, reasons: true },
  });
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((id): id is string => Boolean(id)))];
  const projects = projectIds.length
    ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, nameEn: true } })
    : [];
  const names = new Map(projects.map((p) => [p.id, p.nameEn]));
  return rows.map(({ projectId, ...row }) => ({ ...row, projectName: projectId ? (names.get(projectId) ?? null) : null }));
}

export async function countSuspects(): Promise<number> {
  return prisma.suspectLead.count();
}

/** Let a held enquiry through: it becomes a lead now, routed and announced. */
export async function releaseSuspect(id: string): Promise<{ leadId: string } | null> {
  const lead = await prisma.$transaction(async (tx) => {
    const held = await tx.suspectLead.findUnique({ where: { id } });
    if (!held) return null;
    const created = await tx.leadInquiry.create({ data: fromStored(held.input), select: { id: true } });
    await tx.suspectLead.delete({ where: { id } });
    return { id: created.id, notice: held.notice as unknown as LeadNotice };
  });
  if (!lead) return null;
  announceLead(lead.id, lead.notice);
  return { leadId: lead.id };
}

/** Spam: delete it and block its email and phone. */
export async function markSuspectSpam(id: string, userId: string | null): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const held = await tx.suspectLead.findUnique({ where: { id }, select: { email: true, phone: true } });
    if (!held) return false;
    for (const [kind, value] of [
      ["email", held.email.toLowerCase()],
      ["phone", held.phone],
    ] as const) {
      await tx.leadBlock.upsert({
        where: { kind_value: { kind, value } },
        create: { kind, value, createdById: userId },
        update: {},
      });
    }
    await tx.suspectLead.delete({ where: { id } });
    return true;
  });
}

export async function deleteSuspect(id: string): Promise<boolean> {
  const result = await prisma.suspectLead.deleteMany({ where: { id } });
  return result.count > 0;
}
