/**
 * scripts/seed-club.ts
 * ─────────────────────────────────────────────────────────────────────────
 * ANDAMAN CLUB demo data for /admin/residents and the member portal.
 *
 *   npx tsx scripts/seed-club.ts
 *
 * 1. Sets Project.cardCode rp / tv / vc on the three projects (by slug).
 * 2. In each project, turns ~40% of the SOLD units into TRANSFERRED homes
 *    with a Resident, card no. 1 (a mix of NONE / PRINTED / HANDED), a few
 *    household members and some portal activity. TRANSFERRED units that
 *    have no Resident yet get one too.
 * 3. Puts the demo owner "คุณธนพล อินทรสุวรรณ" (thanapol.in@gmail.com) on
 *    the first RP unit.
 *
 * Idempotent: a unit that already has a Resident is never touched, so a
 * second run only fills gaps. Prints one card URL per project to open at
 * http://localhost:3000/th/club/c/<code>/<token>.
 *
 * Token and house-code generation is repeated here rather than imported
 * from lib/club/token.ts, which is `server-only` and throws outside Next.
 * Demo e-mails use example.com so nothing real is ever mailed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import fs from "node:fs";
import path from "node:path";
import { randomInt } from "node:crypto";
import { PrismaClient, type CardStatus } from "@prisma/client";
import { pgAdapter } from "../lib/prisma-adapter";

function loadEnv() {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnv();

const prisma = new PrismaClient({ adapter: pgAdapter() });

const PROJECTS: { slug: string; code: string }[] = [
  { slug: "residence-prime", code: "rp" },
  { slug: "trinity-village", code: "tv" },
  { slug: "victory", code: "vc" },
];

const OWNERS: [string, string][] = [
  ["คุณสมชาย ศรีสุข", "TH"], ["Ivan Petrov", "RU"], ["Wang Lei", "CN"], ["คุณนภา จันทร์เพ็ญ", "TH"], ["Anna Schmidt", "DE"],
  ["Dmitry Volkov", "RU"], ["Chen Yu", "CN"], ["คุณปกรณ์ ทองดี", "TH"], ["Olga Smirnova", "RU"], ["James Carter", "GB"],
  ["คุณศิริพร วงศ์ไทย", "TH"], ["Liu Ming", "CN"], ["Sergey Kuznetsov", "RU"], ["คุณธนากร รัตนพงศ์", "TH"], ["Emma Wilson", "AU"],
  ["Zhang Wei", "CN"], ["Mikhail Orlov", "RU"], ["คุณวรรณา พรหมมา", "TH"], ["Hiroshi Tanaka", "JP"], ["Elena Ivanova", "RU"],
  ["คุณกิตติ เจริญผล", "TH"], ["Li Na", "CN"], ["Alexander Müller", "DE"], ["คุณพัชรี สุขใจ", "TH"], ["Pavel Sokolov", "RU"],
  ["Sophie Laurent", "FR"], ["Huang Jie", "CN"], ["คุณอนุชา มีสุข", "TH"], ["Natalia Popova", "RU"], ["David Kim", "KR"],
];
const PURPOSES = ["own", "own", "second", "holiday"];
const DEVICES = ["iPhone 15 · Safari", "iPad · Safari", "Android · Chrome", "Mac · Chrome", "Windows · Edge"];
const HANDOVER = ["office", "home", "post"];
const STAFF = "มินตรา ศรีวงศ์";

// ── Deterministic demo randomness (tokens use node:crypto) ───────────────
let seed = 20261008;
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pickR = <T>(list: T[]) => list[Math.floor(rnd() * list.length)];
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join("");

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const secure = (alphabet: string, n: number) => Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join("");
const newCardToken = () => secure(BASE62, 20);
const newHouseCode = (code: string, unit: string) => `${code.toUpperCase()}-${unit.toUpperCase()}-${secure(CODE_ALPHABET, 4)}`;

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

function phoneFor(nat: string): string {
  switch (nat) {
    case "TH": return `08${digits(1)}-${digits(3)}-${digits(4)}`;
    case "RU": return `+7 9${digits(2)} ${digits(3)} ${digits(2)} ${digits(2)}`;
    case "CN": return `+86 13${digits(1)} ${digits(4)} ${digits(4)}`;
    case "DE": return `+49 15${digits(1)} ${digits(7)}`;
    case "GB": return `+44 7${digits(3)} ${digits(6)}`;
    case "AU": return `+61 4${digits(2)} ${digits(3)} ${digits(3)}`;
    case "JP": return `+81 90 ${digits(4)} ${digits(4)}`;
    case "FR": return `+33 6 ${digits(2)} ${digits(2)} ${digits(2)} ${digits(2)}`;
    case "KR": return `+82 10 ${digits(4)} ${digits(4)}`;
    default: return `+${digits(2)} ${digits(8)}`;
  }
}

function emailFor(name: string, index: number): string {
  const latin = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return latin.length ? `${latin.join(".")}@example.com` : `owner${index + 1}@example.com`;
}

type CreateResident = {
  unitId: string;
  unitNumber: string;
  code: string;
  ownerName: string;
  nationality: string;
  phone: string;
  email: string | null;
  purpose: string;
  transferDate: Date;
  cardStatus: CardStatus;
  lastLoginAt: Date | null;
  members: { name: string; relation: string; email: string }[];
};

async function createResident(input: CreateResident) {
  return prisma.$transaction(async (tx) => {
    const resident = await tx.resident.create({
      data: {
        unitId: input.unitId,
        ownerName: input.ownerName,
        nationality: input.nationality,
        phone: input.phone,
        email: input.email,
        purpose: input.purpose,
        transferDate: input.transferDate,
        houseCode: newHouseCode(input.code, input.unitNumber),
        lastLoginAt: input.lastLoginAt,
      },
    });
    const printedAt = input.cardStatus === "NONE" ? null : new Date(input.transferDate.getTime() + 7 * DAY);
    const handedAt = input.cardStatus === "HANDED" ? new Date(input.transferDate.getTime() + 14 * DAY) : null;
    const card = await tx.residentCard.create({
      data: {
        residentId: resident.id,
        token: newCardToken(),
        version: 1,
        issuedAt: input.transferDate,
        status: input.cardStatus,
        printedAt,
        handedAt,
        handedTo: handedAt ? input.ownerName : null,
        handoverMethod: handedAt ? pickR(HANDOVER) : null,
        handedBy: handedAt ? STAFF : null,
      },
    });
    for (const member of input.members) {
      await tx.residentMember.create({ data: { residentId: resident.id, ...member, addedBy: STAFF } });
    }
    await tx.projectUnit.update({ where: { id: input.unitId }, data: { status: "TRANSFERRED" } });

    const events: { kind: "QR_DOWNLOAD" | "CARD_PRINTED" | "CARD_HANDED" | "SCAN" | "OTP_OK" | "TRUSTED_LOGIN"; actor: string; device?: string; at: Date }[] = [];
    if (printedAt) events.push({ kind: "QR_DOWNLOAD", actor: STAFF, at: printedAt }, { kind: "CARD_PRINTED", actor: STAFF, at: printedAt });
    if (handedAt) events.push({ kind: "CARD_HANDED", actor: STAFF, at: handedAt });
    if (input.lastLoginAt) {
      const device = pickR(DEVICES);
      const first = new Date(input.lastLoginAt.getTime() - 30 * DAY);
      events.push(
        { kind: "SCAN", actor: "resident", device, at: first },
        { kind: "OTP_OK", actor: "resident", device, at: first },
        { kind: "TRUSTED_LOGIN", actor: "resident", device, at: input.lastLoginAt },
      );
      await tx.trustedDevice.create({
        data: {
          residentId: resident.id,
          label: device,
          tokenHash: secure("0123456789abcdef", 64),
          firstSeen: first,
          lastSeen: input.lastLoginAt,
          expiresAt: new Date(input.lastLoginAt.getTime() + 90 * DAY),
        },
      });
    }
    await tx.cardEvent.createMany({
      data: events.map((e) => ({ residentId: resident.id, kind: e.kind, actor: e.actor, device: e.device ?? null, createdAt: e.at })),
    });
    return { resident, card };
  });
}

const naturalSort = <T extends { unitNumber: string }>(rows: T[]) =>
  rows.sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));

async function main() {
  const demoCards: { code: string; owner: string; unit: string; token: string }[] = [];
  let ownerIndex = 0;

  for (const { slug, code } of PROJECTS) {
    const project = await prisma.project.findUnique({ where: { slug }, select: { id: true, nameEn: true, cardCode: true } });
    if (!project) {
      console.warn(`✗ no project with slug "${slug}" — skipped (code ${code})`);
      continue;
    }
    if (project.cardCode && project.cardCode !== code) {
      console.warn(`! ${slug} already has cardCode "${project.cardCode}" — left as is (cards may be printed)`);
    } else if (!project.cardCode) {
      const holder = await prisma.project.findUnique({ where: { cardCode: code }, select: { slug: true } });
      if (holder) {
        console.warn(`! cardCode "${code}" is already used by ${holder.slug} — ${slug} skipped`);
        continue;
      }
      await prisma.project.update({ where: { id: project.id }, data: { cardCode: code } });
    }
    const cardCode = project.cardCode ?? code;
    console.log(`✓ ${slug} → ${project.nameEn} · cardCode ${cardCode}`);

    const units = naturalSort(
      await prisma.projectUnit.findMany({
        where: { projectId: project.id },
        select: { id: true, unitNumber: true, status: true, resident: { select: { id: true } } },
      }),
    );
    const existing = units.filter((u) => u.resident).length;
    let created = 0;

    // The portal demo owner on the first RP unit.
    if (code === "rp" && units[0] && !units[0].resident) {
      const first = units[0];
      await createResident({
        unitId: first.id,
        unitNumber: first.unitNumber,
        code: cardCode,
        ownerName: "คุณธนพล อินทรสุวรรณ",
        nationality: "TH",
        phone: "081-234-1234",
        email: "thanapol.in@gmail.com",
        purpose: "own",
        transferDate: daysAgo(570),
        cardStatus: "HANDED",
        lastLoginAt: daysAgo(3),
        members: [{ name: "คุณมาลี อินทรสุวรรณ", relation: "spouse", email: "malee.in@example.com" }],
      });
      first.resident = { id: "demo" };
      created += 1;
    }

    const orphans = units.filter((u) => u.status === "TRANSFERRED" && !u.resident);
    const sold = units.filter((u) => u.status === "SOLD" && !u.resident);
    const target = [...orphans, ...sold.filter((_, i) => i % 5 < 2)]; // ~40% of SOLD

    for (const unit of target) {
      const [ownerName, nationality] = OWNERS[ownerIndex % OWNERS.length];
      const i = ownerIndex++;
      const roll = rnd();
      await createResident({
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        code: cardCode,
        ownerName,
        nationality,
        phone: phoneFor(nationality),
        email: i % 5 === 3 ? null : emailFor(ownerName, i),
        purpose: pickR(PURPOSES),
        transferDate: daysAgo(30 + Math.floor(rnd() * 520)),
        cardStatus: roll < 0.5 ? "HANDED" : roll < 0.75 ? "PRINTED" : "NONE",
        lastLoginAt: i % 5 !== 3 && rnd() < 0.6 ? daysAgo(Math.floor(rnd() * 40)) : null,
        members: i % 7 === 2 ? [{ name: `${ownerName.split(" ")[0]} (spouse)`, relation: "spouse", email: `spouse${i + 1}@example.com` }] : [],
      });
      created += 1;
    }
    console.log(`  ${created} resident(s) created · ${existing} already had one`);

    const demo = await prisma.resident.findFirst({
      where: { unit: { projectId: project.id }, ...(code === "rp" ? { email: "thanapol.in@gmail.com" } : { email: { not: null } }) },
      orderBy: { unit: { unitNumber: "asc" } },
      include: { unit: { select: { unitNumber: true } }, cards: { where: { revokedAt: null }, orderBy: { version: "desc" }, take: 1 } },
    });
    if (demo?.cards[0]) demoCards.push({ code: cardCode, owner: demo.ownerName, unit: demo.unit.unitNumber, token: demo.cards[0].token });
  }

  console.log("\nDemo cards (open in the browser, OTP goes to the resident's e-mail):");
  for (const c of demoCards) {
    console.log(`  ${c.code.toUpperCase()} ${c.unit} · ${c.owner}\n    http://localhost:3000/th/club/c/${c.code}/${c.token}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
