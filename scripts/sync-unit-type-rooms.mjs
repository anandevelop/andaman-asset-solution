/**
 * scripts/sync-unit-type-rooms.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Write prisma/seed-data/unit-type-rooms.json (made by
 * export-unit-type-rooms.mjs) into this database, so the live site's rooms
 * match the ones edited on the laptop.
 *
 *   On the server, after the deploy that carries the JSON:
 *     docker compose -f docker-compose.prod.yml exec app node scripts/sync-unit-type-rooms.mjs
 *     docker compose -f docker-compose.prod.yml exec app node scripts/sync-unit-type-rooms.mjs --apply
 *
 * The first run only reports what would change. Nothing is written
 * without --apply.
 *
 * A COMMAND, NOT A DEPLOY STEP — ON PURPOSE
 *
 * For each unit type in the file, the rooms on each floor are replaced
 * whole: names in every locale, areas, pin positions and photos. That is
 * what makes production match, and it is also why this is never run
 * automatically: anything the team later edits in production's /admin would
 * be overwritten by the laptop's copy on every deploy. Run it when you mean
 * "production should look like my machine", and not otherwise.
 *
 * Matching: project by slug, unit type by code (then by name), floor by its
 * short label (then by position). A floor the file has and production
 * lacks is created; floors production has and the file lacks are left
 * alone, and so are unit types the file does not mention.
 *
 * The project page is cached for up to an hour (revalidate = 3600), so the
 * change shows on the live site within the hour, or at once after a
 * restart of the app container.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const APPLY = process.argv.includes("--apply");

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set.");
  process.exit(1);
}

const FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "seed-data",
  "unit-type-rooms.json"
);

let data;
try {
  data = JSON.parse(readFileSync(FILE, "utf8"));
} catch (error) {
  console.error(`❌ Cannot read prisma/seed-data/unit-type-rooms.json — run \`npm run rooms:export\` locally and deploy it first.\n   ${error.message}`);
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const label = (room) => room.name?.en ?? room.name?.th ?? Object.values(room.name ?? {})[0] ?? "?";
const nameOf = (r) =>
  r.translations.find((t) => t.locale === "en")?.name ??
  r.translations.find((t) => t.locale === "th")?.name ??
  r.translations[0]?.name ??
  "?";

/** "Pump Room|ห้องปั๊ม|…" — enough to tell whether a room changed at all. */
function fingerprintFile(room) {
  const names = Object.entries(room.name ?? {})
    .filter(([, n]) => n.trim() !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([l, n]) => `${l}:${n.trim()}`)
    .join("|");
  return [names, room.areaSqm ?? "", room.xPercent.toFixed(2), room.yPercent.toFixed(2), room.photoUrl ?? ""].join("§");
}
function fingerprintDb(room) {
  const names = [...room.translations]
    .sort((a, b) => a.locale.localeCompare(b.locale))
    .map((t) => `${t.locale}:${t.name.trim()}`)
    .join("|");
  const area = room.areaSqm == null ? "" : Number(room.areaSqm);
  return [names, area, room.xPercent.toFixed(2), room.yPercent.toFixed(2), room.photoUrl ?? ""].join("§");
}

function roomRows(rooms) {
  return rooms.map((room) => ({
    xPercent: room.xPercent,
    yPercent: room.yPercent,
    areaSqm: room.areaSqm == null ? null : room.areaSqm.toFixed(2),
    photoUrl: room.photoUrl,
    sortOrder: room.sortOrder,
    translations: {
      create: Object.entries(room.name ?? {})
        .filter(([, name]) => name.trim() !== "")
        .map(([locale, name]) => ({ locale, name: name.trim().slice(0, 80) })),
    },
  }));
}

let changedFloors = 0;
let createdFloors = 0;
let unchangedFloors = 0;

try {
  console.log(`${APPLY ? "Applying" : "Dry run — nothing is written. Add --apply to write."}`);
  console.log(`Snapshot taken ${data.exportedAt ?? "(unknown time)"}\n`);

  for (const seedProject of data.projects ?? []) {
    const project = await prisma.project.findUnique({
      where: { slug: seedProject.slug },
      select: { id: true },
    });
    if (!project) {
      console.warn(`! No project "${seedProject.slug}" here — skipped`);
      continue;
    }

    const types = await prisma.projectUnitType.findMany({
      where: { projectId: project.id },
      select: {
        id: true,
        code: true,
        name: true,
        floorPlans: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            shortLabel: true,
            floorName: true,
            rooms: {
              orderBy: { sortOrder: "asc" },
              select: {
                xPercent: true,
                yPercent: true,
                areaSqm: true,
                photoUrl: true,
                translations: { select: { locale: true, name: true } },
              },
            },
          },
        },
      },
    });

    for (const seedType of seedProject.unitTypes) {
      const type =
        (seedType.code && types.find((t) => t.code === seedType.code)) ??
        types.find((t) => t.name === seedType.name);
      if (!type) {
        console.warn(`! No unit type ${seedProject.slug}/${seedType.code ?? seedType.name} here — skipped`);
        continue;
      }

      for (const [index, seedFloor] of seedType.floors.entries()) {
        const where = `${seedProject.slug}/${seedType.code ?? seedType.name} ${seedFloor.shortLabel ?? seedFloor.floorName}`;
        const floor =
          (seedFloor.shortLabel && type.floorPlans.find((f) => f.shortLabel === seedFloor.shortLabel)) ??
          type.floorPlans[index];

        if (!floor) {
          console.log(`+ ${where}: floor missing here — create it with ${seedFloor.rooms.length} rooms`);
          createdFloors += 1;
          if (APPLY) {
            await prisma.floorPlan.create({
              data: {
                unitTypeId: type.id,
                floorName: seedFloor.floorName,
                shortLabel: seedFloor.shortLabel,
                areaSqm: seedFloor.areaSqm == null ? null : seedFloor.areaSqm.toFixed(2),
                sortOrder: seedFloor.sortOrder,
                portraitRotation: seedFloor.portraitRotation,
                imageUrl: seedFloor.imageUrl,
                blueprintImageUrl: seedFloor.blueprintImageUrl,
                furnishedImageUrl: seedFloor.furnishedImageUrl,
                imageWidth: seedFloor.imageWidth,
                imageHeight: seedFloor.imageHeight,
                rooms: { create: roomRows(seedFloor.rooms) },
              },
            });
          }
          continue;
        }

        const before = floor.rooms.map(fingerprintDb);
        const after = seedFloor.rooms.map(fingerprintFile);
        if (before.length === after.length && before.every((fp, i) => fp === after[i])) {
          unchangedFloors += 1;
          continue;
        }

        changedFloors += 1;
        const oldNames = floor.rooms.map(nameOf);
        const newNames = seedFloor.rooms.map(label);
        const renamed = newNames.filter((n, i) => oldNames[i] !== undefined && oldNames[i] !== n).length;
        console.log(
          `~ ${where}: ${floor.rooms.length} → ${seedFloor.rooms.length} rooms` +
            (renamed ? `, ${renamed} renamed/reordered` : "")
        );
        for (const n of newNames.filter((n) => !oldNames.includes(n))) console.log(`    + ${n}`);
        for (const n of oldNames.filter((n) => !newNames.includes(n))) console.log(`    − ${n}`);

        if (APPLY) {
          await prisma.$transaction([
            prisma.floorPlanRoom.deleteMany({ where: { floorPlanId: floor.id } }),
            prisma.floorPlan.update({
              where: { id: floor.id },
              data: {
                floorName: seedFloor.floorName,
                areaSqm: seedFloor.areaSqm == null ? null : seedFloor.areaSqm.toFixed(2),
                rooms: { create: roomRows(seedFloor.rooms) },
              },
            }),
          ]);
        }
      }
    }
  }

  console.log(
    `\n${APPLY ? "✓ Done" : "Would change"}: ${changedFloors} floor(s) updated, ${createdFloors} created, ${unchangedFloors} already identical.`
  );
  if (!APPLY && changedFloors + createdFloors > 0) console.log("Run again with --apply to write.");
} finally {
  await prisma.$disconnect();
}
