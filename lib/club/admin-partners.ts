/**
 * lib/club/admin-partners.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ANDAMAN CLUB admin — partner benefits and the per-house approval flow.
 * Server-only; the pages under app/[locale]/admin/(club)/partners and the
 * unit drawer's UnitBenefits read and write through here.
 *
 * Per-house rule (the mockup's requestChange/decide):
 *   • SUPER_ADMIN edits go live at once (PartnerUnitOverride upsert) and
 *     leave a self-approved PartnerOverrideRequest so history is complete.
 *   • ADMIN and SALES edits become ONE pending request per unit+partner;
 *     setting the value back to what is live cancels it.
 *   • A per-house % may only lower the partner's default (checkOverridePct),
 *     checked here again whatever the client sent. If the default is lowered
 *     later, the portal shows min(override, default) — nothing breaks, the
 *     admin just flags the stale override.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { redirect } from "next/navigation";
import { Role, type OverrideRequestStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAdminAction, type AdminSession } from "@/lib/admin/guard";
import { checkOverridePct, type OverrideCheck } from "./benefits";
import { CARD_CODES } from "./constants";

/* ── Guards ────────────────────────────────────────────────────────────── */

/** The CRM roles (lib/admin/nav.ts ROLE_SETS.CRM). Rank alone would admit
 *  EDITOR, which outranks SALES but has no business in resident data. */
const CLUB_ROLES: ReadonlySet<Role> = new Set([Role.SUPER_ADMIN, Role.ADMIN, Role.SALES]);

export function isClubRole(role: Role): boolean {
  return CLUB_ROLES.has(role);
}

export async function requireClubAdmin(locale: string): Promise<AdminSession> {
  const session = await requireAdmin(locale, Role.SALES);
  if (!isClubRole(session.role)) redirect(`/${locale}/admin?denied=1`);
  return session;
}

export async function requireClubAction(minimum: Role = Role.SALES): Promise<AdminSession> {
  const session = await requireAdminAction(minimum);
  if (!isClubRole(session.role)) throw new Error("UNAUTHORISED");
  return session;
}

/** Partner master data (%, projects, show, form, delete). */
export const canEditPartners = (role: Role) => role === Role.SUPER_ADMIN || role === Role.ADMIN;
/** Approving per-house changes. */
export const canApprove = (role: Role) => role === Role.SUPER_ADMIN;

/* ── Shared reads ──────────────────────────────────────────────────────── */

/** The three club projects, in card-code order (rp, tv, vc). */
export async function clubProjects() {
  const rows = await prisma.project.findMany({
    where: { cardCode: { not: null }, deletedAt: null },
    select: { id: true, cardCode: true, nameEn: true, nameTh: true, location: true },
  });
  const order = (code: string | null) => {
    const i = (CARD_CODES as readonly string[]).indexOf(code ?? "");
    return i === -1 ? 99 : i;
  };
  return rows.sort((a, b) => order(a.cardCode) - order(b.cardCode));
}
export type ClubProject = Awaited<ReturnType<typeof clubProjects>>[number];

/** Pending per-house requests — the tab badge and (later) the dashboard. */
export async function pendingApprovalCount(): Promise<number> {
  return prisma.partnerOverrideRequest.count({ where: { status: "PENDING" } });
}

/** "TV · D4" — the house label used in the approvals table and history. */
export function unitLabel(unit: { unitNumber: string; project: { cardCode: string | null } }): string {
  return `${(unit.project.cardCode ?? "").toUpperCase()} · ${unit.unitNumber}`.replace(/^ · /, "");
}

/* ── Per-house state ───────────────────────────────────────────────────── */

export type BenefitState = { hidden: boolean; pct: number | null };

export const sameState = (a: BenefitState, b: BenefitState) => a.hidden === b.hidden && a.pct === b.pct;

type BenefitDb = Pick<typeof prisma, "partnerUnitOverride" | "partnerOverrideRequest" | "partner">;

async function liveState(db: BenefitDb, unitId: string, partnerId: string): Promise<BenefitState> {
  const row = await db.partnerUnitOverride.findUnique({ where: { partnerId_unitId: { partnerId, unitId } } });
  return { hidden: row?.hidden ?? false, pct: row?.discountPct ?? null };
}

/** Make `to` what the resident sees. The default state is no row at all. */
async function setLive(db: BenefitDb, partnerId: string, unitId: string, to: BenefitState, byName: string) {
  if (!to.hidden && to.pct === null) {
    await db.partnerUnitOverride.deleteMany({ where: { partnerId, unitId } });
    return;
  }
  await db.partnerUnitOverride.upsert({
    where: { partnerId_unitId: { partnerId, unitId } },
    update: { hidden: to.hidden, discountPct: to.pct, updatedByName: byName },
    create: { partnerId, unitId, hidden: to.hidden, discountPct: to.pct, updatedByName: byName },
  });
}

export type BenefitError = "NOT_FOUND" | "NOT_ENABLED" | "OWN_REQUEST" | "NOT_PENDING" | "FORBIDDEN" | OverrideCheckReason;
type OverrideCheckReason = Extract<OverrideCheck, { ok: false }>["reason"];

export type BenefitResult =
  | { ok: true; result: "live" | "pending" | "cancelled" | "unchanged" }
  | { ok: false; error: BenefitError; cap?: number };

/**
 * One per-house edit, by role. `to` is the whole target state for the
 * pair — the % box and the switch are sent together.
 */
export async function requestBenefitChange(
  session: AdminSession,
  unitId: string,
  partnerId: string,
  wanted: BenefitState,
): Promise<BenefitResult> {
  const [partner, unit] = await Promise.all([
    prisma.partner.findUnique({ where: { id: partnerId }, include: { projects: { select: { projectId: true } } } }),
    prisma.projectUnit.findUnique({ where: { id: unitId }, select: { id: true, projectId: true } }),
  ]);
  if (!partner || !unit) return { ok: false, error: "NOT_FOUND" };
  if (!partner.projects.some((p) => p.projectId === unit.projectId)) return { ok: false, error: "NOT_ENABLED" };

  // Typing the default itself is "no override".
  const to: BenefitState = {
    hidden: wanted.hidden,
    pct: wanted.pct !== null && wanted.pct === partner.discountPct ? null : wanted.pct,
  };
  const check = checkOverridePct(to.pct, partner.discountPct);
  if (!check.ok) return { ok: false, error: check.reason, cap: check.cap };

  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const from = await liveState(tx, unitId, partnerId);
    const pending = await tx.partnerOverrideRequest.findFirst({
      where: { unitId, partnerId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });

    if (canApprove(session.role)) {
      const decided = {
        status: "APPROVED" as OverrideRequestStatus,
        fromHidden: from.hidden,
        fromPct: from.pct,
        toHidden: to.hidden,
        toPct: to.pct,
        decidedById: session.id,
        decidedByName: session.name,
        decidedAt: now,
      };
      if (pending) {
        await tx.partnerOverrideRequest.update({ where: { id: pending.id }, data: decided });
      } else if (!sameState(from, to)) {
        await tx.partnerOverrideRequest.create({
          data: { ...decided, unitId, partnerId, requestedById: session.id, requestedByName: session.name },
        });
      } else {
        return { ok: true, result: "unchanged" } as const;
      }
      await setLive(tx, partnerId, unitId, to, session.name);
      return { ok: true, result: "live" } as const;
    }

    if (sameState(from, to)) {
      if (!pending) return { ok: true, result: "unchanged" } as const;
      await tx.partnerOverrideRequest.update({ where: { id: pending.id }, data: { status: "CANCELLED" } });
      return { ok: true, result: "cancelled" } as const;
    }
    const proposal = {
      fromHidden: from.hidden,
      fromPct: from.pct,
      toHidden: to.hidden,
      toPct: to.pct,
      requestedById: session.id,
      requestedByName: session.name,
    };
    if (pending) {
      await tx.partnerOverrideRequest.update({ where: { id: pending.id }, data: proposal });
    } else {
      await tx.partnerOverrideRequest.create({ data: { ...proposal, unitId, partnerId } });
    }
    return { ok: true, result: "pending" } as const;
  });
}

/** SUPER_ADMIN approves or rejects someone else's request. */
export async function decideBenefitRequest(
  session: AdminSession,
  requestId: string,
  approve: boolean,
  reason?: string | null,
): Promise<BenefitResult> {
  if (!canApprove(session.role)) return { ok: false, error: "FORBIDDEN" };
  const request = await prisma.partnerOverrideRequest.findUnique({
    where: { id: requestId },
    include: { partner: { select: { discountPct: true } } },
  });
  if (!request) return { ok: false, error: "NOT_FOUND" };
  if (request.status !== "PENDING") return { ok: false, error: "NOT_PENDING" };
  if (request.requestedById === session.id) return { ok: false, error: "OWN_REQUEST" };

  const now = new Date();
  if (!approve) {
    await prisma.partnerOverrideRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        decidedById: session.id,
        decidedByName: session.name,
        decidedAt: now,
        reason: reason?.trim() || null,
      },
    });
    return { ok: true, result: "unchanged" };
  }

  // The default may have been lowered since the request was made.
  const check = checkOverridePct(request.toPct, request.partner.discountPct);
  if (!check.ok) return { ok: false, error: check.reason, cap: check.cap };

  const to = { hidden: request.toHidden, pct: request.toPct };
  await prisma.$transaction(async (tx) => {
    const from = await liveState(tx, request.unitId, request.partnerId);
    await tx.partnerOverrideRequest.update({
      where: { id: requestId },
      data: {
        status: "APPROVED",
        fromHidden: from.hidden,
        fromPct: from.pct,
        decidedById: session.id,
        decidedByName: session.name,
        decidedAt: now,
      },
    });
    await setLive(tx, request.partnerId, request.unitId, to, `${request.requestedByName} · ${session.name}`);
  });
  return { ok: true, result: "live" };
}

/** The requester withdraws their own pending request. */
export async function cancelBenefitRequest(session: AdminSession, requestId: string): Promise<BenefitResult> {
  const request = await prisma.partnerOverrideRequest.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, error: "NOT_FOUND" };
  if (request.status !== "PENDING") return { ok: false, error: "NOT_PENDING" };
  if (request.requestedById !== session.id) return { ok: false, error: "FORBIDDEN" };
  await prisma.partnerOverrideRequest.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
  return { ok: true, result: "cancelled" };
}

/** Approve every pending request the approver did not make (optionally one house). */
export async function approveAllBenefitRequests(session: AdminSession, unitId?: string) {
  if (!canApprove(session.role)) return { approved: 0, failed: 0 };
  const pending = await prisma.partnerOverrideRequest.findMany({
    where: { status: "PENDING", requestedById: { not: session.id }, ...(unitId ? { unitId } : {}) },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  let approved = 0;
  let failed = 0;
  for (const row of pending) {
    const result = await decideBenefitRequest(session, row.id, true);
    if (result.ok) approved += 1;
    else failed += 1;
  }
  return { approved, failed };
}

/** "คืนค่าเริ่มต้น" for a whole house — the same rule per partner. */
export async function resetUnitBenefits(session: AdminSession, unitId: string) {
  const [overrides, pending] = await Promise.all([
    prisma.partnerUnitOverride.findMany({ where: { unitId }, select: { partnerId: true } }),
    prisma.partnerOverrideRequest.findMany({ where: { unitId, status: "PENDING" }, select: { partnerId: true } }),
  ]);
  const partnerIds = [...new Set([...overrides, ...pending].map((row) => row.partnerId))];
  let changed = 0;
  for (const partnerId of partnerIds) {
    const result = await requestBenefitChange(session, unitId, partnerId, { hidden: false, pct: null });
    if (result.ok && result.result !== "unchanged") changed += 1;
  }
  return { changed };
}

/* ── Partner list for the admin table ──────────────────────────────────── */

export async function partnersForAdmin() {
  const [partners, overrideCounts] = await Promise.all([
    prisma.partner.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { translations: true, projects: { select: { projectId: true } } },
    }),
    prisma.partnerUnitOverride.groupBy({
      by: ["partnerId"],
      where: { discountPct: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const counts = new Map(overrideCounts.map((row) => [row.partnerId, row._count._all]));
  return partners.map((partner) => ({ ...partner, overrideCount: counts.get(partner.id) ?? 0 }));
}
export type AdminPartner = Awaited<ReturnType<typeof partnersForAdmin>>[number];

/** Locales a benefit note should be translated into (th is the source). */
export const NOTE_LOCALES = ["en", "zh", "ru"] as const;

export function translationMissing(partner: {
  discountPct: number | null;
  discountNote: string | null;
  translations: { locale: string; discountNote: string | null }[];
}): boolean {
  if (!partner.discountPct || !(partner.discountNote ?? "").trim()) return false;
  return NOTE_LOCALES.some(
    (code) => !partner.translations.some((row) => row.locale === code && (row.discountNote ?? "").trim()),
  );
}

/* ── Approvals tab ─────────────────────────────────────────────────────── */

const requestInclude = {
  partner: { select: { name: true, discountPct: true, discountNote: true } },
  unit: {
    select: {
      id: true,
      unitNumber: true,
      project: { select: { cardCode: true } },
      resident: { select: { ownerName: true } },
    },
  },
} as const;

export async function approvalsData() {
  const [pending, history] = await Promise.all([
    prisma.partnerOverrideRequest.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: requestInclude,
    }),
    prisma.partnerOverrideRequest.findMany({
      where: { status: { in: ["APPROVED", "REJECTED"] } },
      orderBy: { decidedAt: "desc" },
      take: 20,
      include: requestInclude,
    }),
  ]);
  return { pending, history };
}
export type ApprovalRow = Awaited<ReturnType<typeof approvalsData>>["pending"][number];

/* ── The unit drawer's benefit section ─────────────────────────────────── */

export async function unitBenefitsData(unitId: string) {
  const unit = await prisma.projectUnit.findUnique({
    where: { id: unitId },
    select: { id: true, unitNumber: true, projectId: true, project: { select: { cardCode: true, nameEn: true, nameTh: true } } },
  });
  if (!unit) return null;
  const [partners, hiddenForProject, overrides, pending, lastApplied] = await Promise.all([
    prisma.partner.findMany({
      where: { isActive: true, projects: { some: { projectId: unit.projectId } } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        category: true,
        area: true,
        discountPct: true,
        discountNote: true,
        coverImage: true,
        validFrom: true,
        validTo: true,
      },
    }),
    prisma.partner.count({ where: { isActive: true, projects: { none: { projectId: unit.projectId } } } }),
    prisma.partnerUnitOverride.findMany({ where: { unitId } }),
    prisma.partnerOverrideRequest.findMany({ where: { unitId, status: "PENDING" } }),
    prisma.partnerOverrideRequest.findFirst({
      where: { unitId, status: "APPROVED" },
      orderBy: { decidedAt: "desc" },
      select: { requestedById: true, requestedByName: true, decidedById: true, decidedByName: true, decidedAt: true },
    }),
  ]);
  return { unit, partners, hiddenForProject, overrides, pending, lastApplied };
}
