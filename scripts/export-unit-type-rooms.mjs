/**
 * scripts/export-unit-type-rooms.mjs
 * ─────────────────────────────────────────────────────────────────────────
 * Snapshot every unit type's floors and rooms — names in every locale,
 * areas, pin positions, photos — out of the database you point it at, into
 * prisma/seed-data/unit-type-rooms.json. Commit that file; its partner,
 * scripts/sync-unit-type-rooms.mjs, writes it into another database.
 *
 *   npm run rooms:export
 *
 * Why it exists: the rooms are edited in /admin on a laptop, but production
 * has its own database and `prisma db seed` refuses to run there (it would
 * add demo content). A deploy ships code, never rows, so without this the
 * live site keeps whatever rooms it had — and the 3D model, which matches
 * its rooms to these by English name, labels them wrongly or not at all.
 *
 * Read-only. Plain JavaScript for the same reason as create-admin.mjs.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set. Run it as `npm run rooms:export`, which reads .env.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const OUT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "prisma",
  "seed-data",
  "unit-type-rooms.json"
);

const dec = (v) => (v == null ? null : Number(v));

try {
  const projects = await prisma.project.findMany({
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      unitTypes: {
        orderBy: { code: "asc" },
        select: {
          code: true,
          name: true,
          floorPlans: {
            orderBy: { sortOrder: "asc" },
            select: {
              floorName: true,
              shortLabel: true,
              areaSqm: true,
              sortOrder: true,
              portraitRotation: true,
              imageUrl: true,
              blueprintImageUrl: true,
              furnishedImageUrl: true,
              imageWidth: true,
              imageHeight: true,
              rooms: {
                orderBy: { sortOrder: "asc" },
                select: {
                  sortOrder: true,
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
      },
    },
  });

  let floors = 0;
  let rooms = 0;

  const out = {
    _about:
      "Written by scripts/export-unit-type-rooms.mjs — do not edit by hand. " +
      "Applied to another database by scripts/sync-unit-type-rooms.mjs.",
    exportedAt: new Date().toISOString(),
    projects: projects
      .map((p) => ({
        slug: p.slug,
        unitTypes: p.unitTypes
          .filter((t) => t.floorPlans.length > 0)
          .map((t) => ({
            code: t.code,
            name: t.name,
            floors: t.floorPlans.map((f) => {
              floors += 1;
              rooms += f.rooms.length;
              return {
                floorName: f.floorName,
                shortLabel: f.shortLabel,
                areaSqm: dec(f.areaSqm),
                sortOrder: f.sortOrder,
                portraitRotation: f.portraitRotation,
                imageUrl: f.imageUrl,
                blueprintImageUrl: f.blueprintImageUrl,
                furnishedImageUrl: f.furnishedImageUrl,
                imageWidth: f.imageWidth,
                imageHeight: f.imageHeight,
                rooms: f.rooms.map((r) => ({
                  sortOrder: r.sortOrder,
                  name: Object.fromEntries(
                    [...r.translations]
                      .sort((a, b) => a.locale.localeCompare(b.locale))
                      .map((tr) => [tr.locale, tr.name])
                  ),
                  areaSqm: dec(r.areaSqm),
                  xPercent: r.xPercent,
                  yPercent: r.yPercent,
                  photoUrl: r.photoUrl,
                })),
              };
            }),
          })),
      }))
      .filter((p) => p.unitTypes.length > 0),
  };

  writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n");

  for (const p of out.projects) {
    for (const t of p.unitTypes) {
      console.log(
        `  ${p.slug}/${t.code}: ` + t.floors.map((f) => `${f.shortLabel ?? f.floorName} ${f.rooms.length}`).join(" · ")
      );
    }
  }
  console.log(`✓ ${floors} floors, ${rooms} rooms → prisma/seed-data/unit-type-rooms.json`);
} finally {
  await prisma.$disconnect();
}
