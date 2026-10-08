/**
 * app/api/admin/club/qr/[cardId]/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GET ?format=png|svg — one card's QR file for the printer.
 *
 * PNG: 1200 px with the quiet zone. SVG: vector, 40 mm. Downloading is
 * taken as "this card is being printed": a NONE card becomes PRINTED, and
 * every download is a QR_DOWNLOAD in the card's access log — the file is
 * the card, so who took a copy matters.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { cardUrl } from "@/lib/club/constants";
import { logCardEvent } from "@/lib/club/cards";
import { qrFileName, qrPng, qrSvgFile } from "@/lib/club/admin-residents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ cardId: string }> }) {
  let actor: string;
  try {
    actor = (await requireAdminAction(Role.SALES)).name;
  } catch {
    return NextResponse.json({ error: "unauthorised" }, { status: 403 });
  }

  const { cardId } = await params;
  const format = new URL(request.url).searchParams.get("format") === "svg" ? "svg" : "png";
  if (!/^[a-z0-9]{10,40}$/.test(cardId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const card = await prisma.residentCard.findUnique({
    where: { id: cardId },
    include: { resident: { include: { unit: { select: { unitNumber: true, project: { select: { cardCode: true } } } } } } },
  });
  const code = card?.resident.unit.project.cardCode;
  if (!card || !code) return NextResponse.json({ error: "not found" }, { status: 404 });
  // A revoked card's QR must never be printed again.
  if (card.revokedAt) return NextResponse.json({ error: "revoked" }, { status: 410 });

  const url = cardUrl(code, card.token);
  const name = qrFileName(code, card.resident.unit.unitNumber, card.version, format);
  const body = format === "svg" ? Buffer.from(await qrSvgFile(url), "utf8") : await qrPng(url);

  await logCardEvent(card.residentId, "QR_DOWNLOAD", actor);
  if (card.status === "NONE") {
    await prisma.residentCard.update({ where: { id: card.id }, data: { status: "PRINTED", printedAt: new Date() } });
    await logCardEvent(card.residentId, "CARD_PRINTED", actor);
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": format === "svg" ? "image/svg+xml" : "image/png",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
