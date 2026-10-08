/**
 * app/api/admin/club/qr-zip/[projectId]/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GET — every current card of a project as one ZIP for the card printer:
 * png/ (1200 px) + svg/ (40 mm) + manifest.csv (file → unit, for packing)
 * + README.txt. ADMIN and above: it is a bulk copy of every house's key.
 *
 * Cards still NONE become PRINTED, and each card logs a QR_DOWNLOAD.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminAction } from "@/lib/admin/guard";
import { rateLimit } from "@/lib/rate-limit";
import { cardUrl } from "@/lib/club/constants";
import { qrFileName, qrPng, qrSvgFile } from "@/lib/club/admin-residents";
import { makeZip, type ZipEntry } from "@/lib/club/zip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const README = [
  "Andaman resident card QR codes",
  "- png/: 1200px PNG, quiet zone included (print >= 25 mm)",
  "- svg/: vector, 40 mm default size",
  "- manifest.csv: file -> unit mapping for packing only. Do NOT print unit numbers on the card.",
  "Confidential: each QR opens a private resident link. Delete these files after printing.",
  "",
].join("\n");

const csvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  let session;
  try {
    session = await requireAdminAction(Role.ADMIN);
  } catch {
    return NextResponse.json({ error: "unauthorised" }, { status: 403 });
  }
  if (!rateLimit(`club-qr-zip:${session.id}`, { limit: 5, windowMs: 60_000 }).ok) {
    return NextResponse.json({ error: "too many requests" }, { status: 429 });
  }

  const { projectId } = await params;
  if (!/^[a-z0-9]{10,40}$/.test(projectId)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { cardCode: true, nameEn: true } });
  const code = project?.cardCode;
  if (!project || !code) return NextResponse.json({ error: "not found" }, { status: 404 });

  const cards = await prisma.residentCard.findMany({
    where: { revokedAt: null, resident: { unit: { projectId } } },
    include: { resident: { select: { id: true, unit: { select: { unitNumber: true } } } } },
  });
  cards.sort((a, b) => a.resident.unit.unitNumber.localeCompare(b.resident.unit.unitNumber, undefined, { numeric: true }));

  const png: ZipEntry[] = [];
  const svg: ZipEntry[] = [];
  const rows = [["file", "project", "unit", "card_no", "issued", "qr_url"].map(csvCell).join(",")];
  for (const card of cards) {
    const unit = card.resident.unit.unitNumber;
    const url = cardUrl(code, card.token);
    const pngName = qrFileName(code, unit, card.version, "png");
    png.push({ name: `png/${pngName}`, data: await qrPng(url) });
    svg.push({ name: `svg/${qrFileName(code, unit, card.version, "svg")}`, data: await qrSvgFile(url) });
    rows.push([pngName, project.nameEn, unit, card.version, isoDay(card.issuedAt), url].map(csvCell).join(","));
  }

  const zip = makeZip([
    ...png,
    ...svg,
    { name: "manifest.csv", data: `﻿${rows.join("\r\n")}` },
    { name: "README.txt", data: README },
  ]);

  const now = new Date();
  await prisma.$transaction([
    prisma.residentCard.updateMany({
      where: { id: { in: cards.filter((c) => c.status === "NONE").map((c) => c.id) } },
      data: { status: "PRINTED", printedAt: now },
    }),
    prisma.cardEvent.createMany({
      data: [
        ...cards.map((c) => ({ residentId: c.residentId, kind: "QR_DOWNLOAD" as const, actor: session.name })),
        ...cards
          .filter((c) => c.status === "NONE")
          .map((c) => ({ residentId: c.residentId, kind: "CARD_PRINTED" as const, actor: session.name })),
      ],
    }),
  ]);

  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="andaman-qr_${code.toUpperCase()}_${cards.length}cards.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
