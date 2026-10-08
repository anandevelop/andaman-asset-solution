/**
 * lib/club/admin-residents.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Reads behind /admin/residents (the unit board, the residents table, the
 * unit drawer) and the QR file helpers shared by the drawer, the single
 * download route and the project ZIP.
 *
 * QR files are generated on the server from the stored token: the token is
 * the card, so it never needs to sit in a client bundle beyond the drawer
 * preview a signed-in admin is already looking at.
 * ─────────────────────────────────────────────────────────────────────────
 */
import "server-only";
import QRCode from "qrcode";
import type { CardStatus, UnitStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cardUrl } from "./constants";
import { effectivePct, isWithinValidity, partnerValidity } from "./benefits";

export const UNIT_STATUSES: UnitStatus[] = ["AVAILABLE", "RESERVED", "SOLD", "TRANSFERRED"];

/** Reservation flag on the board: expires within this many days. */
export const RESERVATION_FLAG_DAYS = 3;

const DAY = 86_400_000;

/** "RP-R12-8K4Q" → "RP-R12-••••" — the random part is the secret bit. */
export function maskHouseCode(code: string): string {
  const cut = code.lastIndexOf("-");
  return cut > 0 ? `${code.slice(0, cut + 1)}••••` : "••••";
}

/** member.andamanassetsolution.com/rp/AbC1•••• */
export function maskCardUrl(url: string): string {
  const bare = url.replace(/^https?:\/\//, "");
  const cut = bare.lastIndexOf("/");
  return `${bare.slice(0, cut + 1)}${bare.slice(cut + 1, cut + 5)}••••`;
}

/** First name without the Thai honorific, for a 60px tile. */
export function tileName(ownerName: string): string {
  return ownerName.replace(/^คุณ\s*/, "").split(/\s+/)[0] ?? "";
}

// ── QR files ──────────────────────────────────────────────────────────

/** andaman-qr_RP-R12_card01.png — "+" in a unit number is not filename-safe. */
export function qrFileName(cardCode: string, unitNumber: string, version: number, ext: "png" | "svg"): string {
  const unit = unitNumber.replace(/\+/g, "P").replace(/[^0-9A-Za-z-]/g, "");
  return `andaman-qr_${cardCode.toUpperCase()}-${unit}_card${String(version).padStart(2, "0")}.${ext}`;
}

/** 1200px PNG, 4-module quiet zone included (print at 25 mm or larger). */
export async function qrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, { type: "png", errorCorrectionLevel: "M", margin: 4, width: 1200, color: { dark: "#000000", light: "#ffffff" } });
}

/** Vector file for the printer: 40 mm square by default, quiet zone included. */
export async function qrSvgFile(url: string): Promise<string> {
  const svg = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, color: { dark: "#000000", light: "#ffffff" } });
  const sized = svg.replace("<svg ", '<svg width="40mm" height="40mm" ');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${sized}`;
}

/** Inline preview for the drawer / print mock-up. */
export async function qrPreviewSvg(url: string, dark = "#111111"): Promise<string> {
  return QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark, light: "#ffffff" } });
}

// ── Projects & board ──────────────────────────────────────────────────

export async function clubProjects() {
  return prisma.project.findMany({
    where: { cardCode: { not: null } },
    select: { id: true, slug: true, cardCode: true, nameEn: true, nameTh: true, _count: { select: { units: true } } },
    orderBy: { cardCode: "asc" },
  });
}

export type BoardUnit = Awaited<ReturnType<typeof projectBoard>>["units"][number];

export async function projectBoard(projectId: string) {
  const [types, units] = await Promise.all([
    prisma.projectUnitType.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, livingAreaSqm: true, bedrooms: true, priceFromTHB: true },
    }),
    prisma.projectUnit.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { unitNumber: "asc" }],
      select: {
        id: true,
        unitNumber: true,
        status: true,
        unitTypeId: true,
        priceTHB: true,
        releasedForSale: true,
        reservationExpiresAt: true,
        reservedByLead: { select: { name: true } },
        resident: {
          select: {
            id: true,
            ownerName: true,
            phone: true,
            email: true,
            nationality: true,
            purpose: true,
            transferDate: true,
            houseCode: true,
            lastLoginAt: true,
            _count: { select: { members: true } },
            cards: {
              where: { revokedAt: null },
              orderBy: { version: "desc" },
              take: 1,
              select: { id: true, version: true, status: true, handedAt: true, printedAt: true },
            },
          },
        },
      },
    }),
  ]);
  units.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
  return { types, units };
}

export function countByStatus(units: { status: UnitStatus }[]): Record<UnitStatus, number> {
  const out: Record<UnitStatus, number> = { AVAILABLE: 0, RESERVED: 0, SOLD: 0, TRANSFERRED: 0 };
  for (const unit of units) out[unit.status] += 1;
  return out;
}

/** Whole days from now until `date` (negative when past), rounded up. */
export function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / DAY);
}

/** Whole days since `date`, rounded down. */
export function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / DAY);
}

export function reservationExpiringSoon(expiresAt: Date | null, now = new Date()): boolean {
  if (!expiresAt) return false;
  return (expiresAt.getTime() - now.getTime()) / DAY <= RESERVATION_FLAG_DAYS;
}

/**
 * Partners each house sees: { total, usable } per unit. `total` = active,
 * in-date partners offered to the project and not hidden for the house;
 * `usable` = those with a discount actually set.
 */
export async function partnerCounts(projectId: string, unitIds: string[]) {
  const [links, overrides] = await Promise.all([
    prisma.partnerProject.findMany({
      where: { projectId, partner: { isActive: true } },
      select: { partner: { select: { id: true, discountPct: true, validFrom: true, validTo: true } } },
    }),
    unitIds.length
      ? prisma.partnerUnitOverride.findMany({
          where: { unitId: { in: unitIds } },
          select: { unitId: true, partnerId: true, hidden: true, discountPct: true },
        })
      : Promise.resolve([]),
  ]);
  const partners = links.map((l) => l.partner).filter((p) => isWithinValidity(partnerValidity(p.validFrom, p.validTo)));
  const byUnit = new Map<string, Map<string, { hidden: boolean; discountPct: number | null }>>();
  for (const o of overrides) {
    if (!byUnit.has(o.unitId)) byUnit.set(o.unitId, new Map());
    byUnit.get(o.unitId)!.set(o.partnerId, o);
  }
  const out = new Map<string, { total: number; usable: number }>();
  for (const unitId of unitIds) {
    const own = byUnit.get(unitId);
    let total = 0;
    let usable = 0;
    for (const p of partners) {
      const o = own?.get(p.id);
      if (o?.hidden) continue;
      total += 1;
      if (effectivePct(p.discountPct, o?.discountPct)) usable += 1;
    }
    out.set(unitId, { total, usable });
  }
  return out;
}

export async function findByHouseCode(code: string) {
  const clean = code.trim().toUpperCase();
  if (clean.length < 4) return null;
  return prisma.resident.findUnique({
    where: { houseCode: clean },
    select: { ownerName: true, unit: { select: { id: true, unitNumber: true, projectId: true } } },
  });
}

// ── Unit drawer ───────────────────────────────────────────────────────

export type UnitDetail = NonNullable<Awaited<ReturnType<typeof unitDetail>>>;

export async function unitDetail(unitId: string) {
  return prisma.projectUnit.findUnique({
    where: { id: unitId },
    include: {
      project: { select: { id: true, cardCode: true, nameEn: true, nameTh: true } },
      unitType: { select: { name: true, livingAreaSqm: true, bedrooms: true } },
      reservedByLead: { select: { name: true, phone: true, email: true, nationality: true } },
      resident: {
        include: {
          members: { orderBy: { createdAt: "asc" } },
          pastOwners: { orderBy: { toDate: "desc" } },
          cards: { orderBy: { version: "desc" } },
          devices: { where: { revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeen: "desc" } },
          events: { orderBy: { createdAt: "desc" }, take: 30 },
        },
      },
    },
  });
}
