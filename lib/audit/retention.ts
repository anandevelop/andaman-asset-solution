/**
 * lib/audit/retention.ts
 * ─────────────────────────────────────────────────────────────────────────
 * How long the audit trail is kept, and the nightly job that enforces it.
 *
 * Three windows, by what an entry is worth later:
 *
 *  · Sign-ins, sign-outs and failed attempts — 90 days. By far the most
 *    numerous rows (every idle timeout is one), and a question about an
 *    odd sign-in is asked within weeks or not at all.
 *  · Edits — 30 days. The owner's call: an edit is rarely looked up, and
 *    almost never reverted, after the month it was made in. The price is
 *    that "who changed this price" has no answer once a month has passed.
 *  · Customer-data events (a contact revealed, a lead erased) — three
 *    years, the same as the customer data itself (lib/pdpa.ts): they are
 *    the evidence of how personal data was handled. There are few of them.
 *
 * The trail stays append-only for people — nobody can edit or remove an
 * entry from the back office. Only this job removes rows, and only by age.
 *
 * Pure rules up top; the one database function at the bottom.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AUTH_MODEL, CONTACT_REVEAL, LEAD_ERASE } from "@/lib/audit/events";

export const AUDIT_RETENTION_DAYS = {
  signIns: 90,
  edits: 30,
  customerData: 3 * 365,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const CUSTOMER_DATA_ACTIONS = [CONTACT_REVEAL, LEAD_ERASE];

const before = (now: Date, days: number) => new Date(now.getTime() - days * DAY_MS);

/** The three deletions, as `where` clauses. Every entry falls into exactly one. */
export function auditPruneFilters(now = new Date()): Record<keyof typeof AUDIT_RETENTION_DAYS, Prisma.AuditLogWhereInput> {
  return {
    signIns: { model: AUTH_MODEL, createdAt: { lt: before(now, AUDIT_RETENTION_DAYS.signIns) } },
    customerData: {
      action: { in: CUSTOMER_DATA_ACTIONS },
      createdAt: { lt: before(now, AUDIT_RETENTION_DAYS.customerData) },
    },
    edits: {
      model: { not: AUTH_MODEL },
      action: { notIn: CUSTOMER_DATA_ACTIONS },
      createdAt: { lt: before(now, AUDIT_RETENTION_DAYS.edits) },
    },
  };
}

export type AuditPruneResult = { signIns: number; edits: number; customerData: number };

/** Delete what has aged out. Safe to run any number of times a day. */
export async function pruneAuditLog(now = new Date()): Promise<AuditPruneResult> {
  const filters = auditPruneFilters(now);
  const [signIns, edits, customerData] = await Promise.all([
    prisma.auditLog.deleteMany({ where: filters.signIns }),
    prisma.auditLog.deleteMany({ where: filters.edits }),
    prisma.auditLog.deleteMany({ where: filters.customerData }),
  ]);
  return { signIns: signIns.count, edits: edits.count, customerData: customerData.count };
}
