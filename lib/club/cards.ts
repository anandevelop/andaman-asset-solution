/**
 * lib/club/cards.ts — card lookup, issue/reissue, the access log.
 */
import "server-only";
import type { CardEventKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isCardCode } from "./constants";
import { isPlausibleToken, newCardToken, newHouseCode } from "./token";

/** The models these helpers touch — satisfied by `prisma` and by a $transaction client. */
export type ClubDb = Pick<typeof prisma, "residentCard" | "resident" | "trustedDevice" | "cardEvent">;

export type CardLookup = Awaited<ReturnType<typeof findCardByToken>>;

/**
 * Resolve /<code>/<token>. Returns null for anything unknown, and also when
 * the token belongs to a different project than the code in the URL — an
 * unknown card and a mismatched one must look identical from outside.
 */
export async function findCardByToken(code: string, token: string) {
  if (!isCardCode(code) || !isPlausibleToken(token)) return null;
  const card = await prisma.residentCard.findUnique({
    where: { token },
    include: {
      resident: {
        include: { unit: { include: { project: { select: { id: true, cardCode: true, nameEn: true, nameTh: true, slug: true } } } } },
      },
    },
  });
  if (!card || card.resident.unit.project.cardCode !== code) return null;
  return card;
}

/** The newest non-revoked card of a resident. */
export async function currentCard(residentId: string) {
  return prisma.residentCard.findFirst({
    where: { residentId, revokedAt: null },
    orderBy: { version: "desc" },
  });
}

export async function logCardEvent(
  residentId: string,
  kind: CardEventKind,
  actor: string,
  extra: { device?: string | null; ip?: string | null } = {},
  tx: ClubDb = prisma,
) {
  await tx.cardEvent.create({ data: { residentId, kind, actor, device: extra.device ?? null, ip: extra.ip ?? null } });
}

/**
 * Issue card version n+1: the old token and house code die at once, every
 * trusted device is signed out, and the new card starts as NONE (not
 * printed). Used by "บัตรหาย · ออกบัตรใหม่" and by a resale.
 */
export async function reissueCard(residentId: string, actor: string, tx: ClubDb = prisma) {
  const resident = await tx.resident.findUniqueOrThrow({
    where: { id: residentId },
    include: { unit: { include: { project: { select: { cardCode: true } } } } },
  });
  const latest = await tx.residentCard.findFirst({ where: { residentId }, orderBy: { version: "desc" } });
  await tx.residentCard.updateMany({ where: { residentId, revokedAt: null }, data: { revokedAt: new Date() } });
  const card = await tx.residentCard.create({
    data: { residentId, token: newCardToken(), version: (latest?.version ?? 0) + 1 },
  });
  await tx.resident.update({
    where: { id: residentId },
    data: { houseCode: newHouseCode(resident.unit.project.cardCode ?? "xx", resident.unit.unitNumber) },
  });
  await tx.trustedDevice.updateMany({ where: { residentId, revokedAt: null }, data: { revokedAt: new Date() } });
  await logCardEvent(residentId, "REISSUE", actor, {}, tx);
  return card;
}
