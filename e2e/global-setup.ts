/**
 * e2e/global-setup.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Prepares the end-to-end database: pushes the schema, wipes every table,
 * writes the fixtures, creates the admin account.
 *
 * Runs once before the suite, not per spec. Per-spec seeding is tidier in
 * principle and unusable in practice — it either serialises every test
 * behind a truncate or leaves them racing over the same rows.
 *
 * THE WIPE IS THE REASON FOR THE GUARD BELOW.
 *
 * This deletes everything in the database it is pointed at. It therefore
 * refuses to start unless E2E_DATABASE_URL is set and differs from
 * DATABASE_URL, because the alternative is one absent-minded `npm run
 * test:e2e` destroying a development database — or, once someone has the
 * production URL in their shell, worse.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { execFileSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "../lib/prisma-adapter";
import bcrypt from "bcryptjs";
import {
  ADMIN,
  ADMIN_POOL,
  DRAFT_BROCHURE,
  E_BROCHURE,
  PENDING_ADMIN,
  MEDIA,
  PROJECTS,
  VIEWER,
} from "./fixtures";
import { encryptSecret } from "../lib/totp";

/*
  `npm run test:e2e:db` runs this file directly with `tsx`, outside
  Playwright entirely — nothing loads `.env` for it otherwise. See the
  matching comment in playwright.config.ts for what breaks without this.
*/
loadEnvConfig(process.cwd());

const BCRYPT_ROUNDS = 10; // Lower than production's 12: this runs per suite.

function resolveDatabaseUrl(): string {
  const e2eUrl = process.env.E2E_DATABASE_URL;
  const devUrl = process.env.DATABASE_URL;

  if (!e2eUrl) {
    throw new Error(
      [
        "",
        "E2E_DATABASE_URL is not set.",
        "",
        "The end-to-end suite wipes every table in the database it points",
        "at, so it will not fall back to DATABASE_URL. Create a separate",
        "database and add the URL to .env:",
        "",
        "  createdb andaman_e2e",
        '  E2E_DATABASE_URL="postgresql://…@localhost:5432/andaman_e2e?schema=public"',
        "",
        "See docs/TESTING.md.",
        "",
      ].join("\n"),
    );
  }

  if (devUrl && e2eUrl === devUrl) {
    throw new Error(
      "E2E_DATABASE_URL is identical to DATABASE_URL. Refusing to wipe the " +
        "development database — point the e2e suite at its own.",
    );
  }

  return e2eUrl;
}

/**
 * Truncate rather than drop and recreate.
 *
 * `prisma migrate reset` would be the obvious call and takes tens of
 * seconds; TRUNCATE … CASCADE takes milliseconds and leaves the schema in
 * place. RESTART IDENTITY matters for the same reason the fixtures are
 * explicit: a run should not depend on how many runs preceded it.
 */
async function wipe(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;

  if (tables.length === 0) return;

  const list = tables.map((row) => `"public"."${row.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function seed(prisma: PrismaClient) {
  for (const [index, project] of PROJECTS.entries()) {
    const { isPublished, ...rest } = project as (typeof PROJECTS)[number] & {
      isPublished?: boolean;
    };

    await prisma.project.create({
      data: {
        ...rest,
        taglineEn: `${project.nameEn} — a fixture for the end-to-end suite.`,
        taglineTh: `${project.nameTh} — ข้อมูลตัวอย่างสำหรับการทดสอบ`,
        descriptionEn: "Seeded by e2e/global-setup.ts. Not real inventory.",
        descriptionTh: "ข้อมูลทดสอบ ไม่ใช่โครงการจริง",
        facilities: ["Clubhouse", "24-hr Security"],
        gallery: [],
        isPublished: isPublished ?? true,
        sortOrder: index,
      },
    });
  }

  /*
    One published e-brochure, attached to the first project so the spec
    covers the project-link path, translated into all four locales so the
    viewer's chrome can be asserted in any of them.
  */
  const trinity = await prisma.project.findUnique({
    where: { slug: PROJECTS[0].slug },
    select: { id: true },
  });

  await prisma.media.create({
    data: {
      url: MEDIA.url,
      mimeType: MEDIA.mimeType,
      width: MEDIA.width,
      height: MEDIA.height,
      sizeBytes: MEDIA.sizeBytes,
      altText: MEDIA.altText,
      tags: [...MEDIA.tags],
    },
  });

  await prisma.eBrochure.create({
    data: {
      slug: E_BROCHURE.slug,
      fileUrl: E_BROCHURE.fileUrl,
      projectId: trinity?.id ?? null,
      isPublished: true,
      sortOrder: 0,
      translations: {
        create: (Object.keys(E_BROCHURE.title) as (keyof typeof E_BROCHURE.title)[]).map(
          (locale) => ({
            locale,
            title: E_BROCHURE.title[locale],
            description: E_BROCHURE.description[locale],
          }),
        ),
      },
    },
  });

  // Unpublished, so the index has something it must not show and the
  // detail route has a slug it must 404 rather than serve.
  await prisma.eBrochure.create({
    data: {
      slug: DRAFT_BROCHURE.slug,
      fileUrl: DRAFT_BROCHURE.fileUrl,
      isPublished: false,
      sortOrder: 1,
      translations: { create: { locale: "en", title: DRAFT_BROCHURE.title } },
    },
  });

  await prisma.user.create({
    data: {
      name: ADMIN.name,
      email: ADMIN.email,
      passwordHash: await bcrypt.hash(ADMIN.password, BCRYPT_ROUNDS),
      role: "SUPER_ADMIN",
      isActive: true,
      /*
        Enrolled up front, exactly as the application would store it — the
        secret is encrypted with the same helper the app uses, so a change
        to that encryption breaks the suite here rather than in production.
        NEXTAUTH_SECRET must therefore be set for the e2e run; it already is,
        or NextAuth itself would refuse to issue a session.
      */
      totpSecret: encryptSecret(ADMIN.totpSecret),
      totpEnabledAt: new Date(),
    },
  });

  /*
    The sign-in pool. Same shape as ADMIN, one row each, so no two sign-ins
    contend for the same burned TOTP step — see the note in fixtures.ts.
    Created in one statement rather than a loop of awaits: twelve round
    trips to save nothing would be a strange thing to add to a setup whose
    whole point is speed.
  */
  await prisma.user.createMany({
    data: await Promise.all(
      ADMIN_POOL.map(async (account) => ({
        name: account.name,
        email: account.email,
        passwordHash: await bcrypt.hash(account.password, BCRYPT_ROUNDS),
        role: "SUPER_ADMIN" as const,
        isActive: true,
        totpSecret: encryptSecret(account.totpSecret),
        totpEnabledAt: new Date(),
      })),
    ),
  });

  /*
    No totpSecret and no totpEnabledAt, so lib/two-factor-policy.ts reports
    this ADMIN as still owing enrolment. That is the state the guard exists
    to contain, and the only way to test it is to seed an account sitting
    in it.
  */
  await prisma.user.create({
    data: {
      name: PENDING_ADMIN.name,
      email: PENDING_ADMIN.email,
      passwordHash: await bcrypt.hash(PENDING_ADMIN.password, BCRYPT_ROUNDS),
      role: "ADMIN",
      isActive: true,
    },
  });

  // Phase 4's read-only role — enrolled the same way ADMIN is, since
  // lib/two-factor-policy.ts exempts nobody.
  await prisma.user.create({
    data: {
      name: VIEWER.name,
      email: VIEWER.email,
      passwordHash: await bcrypt.hash(VIEWER.password, BCRYPT_ROUNDS),
      role: "VIEWER",
      isActive: true,
      totpSecret: encryptSecret(VIEWER.totpSecret),
      totpEnabledAt: new Date(),
    },
  });
}

/**
 * Push the schema, wipe it, write the fixtures.
 *
 * Exported so CI can run this *before* Playwright starts — see the default
 * export below for why that ordering matters.
 */
export async function prepareDatabase() {
  const url = resolveDatabaseUrl();

  console.log("[e2e] preparing the test database…");

  /*
    `db push`, not `migrate deploy`.

    The test database has no history worth preserving and is recreated from
    scratch every run, so replaying the migration list only adds time. The
    migrations themselves are exercised by CI's own migrate job, which is
    the right place for that check.
  */
  /*
    `--url`, and no `--skip-generate`. Both changed in Prisma 7: the CLI
    now reads its connection string from prisma.config.ts rather than the
    environment, so the e2e database has to be named on the command line or
    the config's DATABASE_URL wins and the suite quietly rebuilds the
    development database instead. `--skip-generate` is gone because push no
    longer generates a client at all.
  */
  execFileSync("npx", ["prisma", "db", "push", "--url", url, "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });

  // `datasources` is gone in Prisma 7 — the URL rides on the adapter now.
  const prisma = new PrismaClient({ adapter: pgAdapter(url) });

  try {
    await wipe(prisma);
    await seed(prisma);
    console.log(
      `[e2e] seeded ${PROJECTS.length} projects and one admin (${ADMIN.email}).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * PLAYWRIGHT STARTS `webServer` BEFORE IT RUNS THIS.
 *
 * That ordering is fine against `next dev`, which renders every request
 * fresh — and wrong against CI, where the web server command is
 * `npm run build && next start`. The build reads the database: it resolves
 * generateStaticParams and prerenders the home page and the project list.
 * Run before the seed, it sees an empty database (or, on a fresh CI
 * service container, no tables at all — "The table public.projects does not
 * exist") and bakes those pages empty, with `revalidate = 3600` holding
 * them that way for the rest of the run. Seeding afterwards cannot undo it.
 *
 * So in CI the workflow calls prepareDatabase() itself, as a step before
 * `npm run test:e2e`, and sets E2E_DB_ALREADY_PREPARED — leaving this hook
 * to do nothing rather than truncate the fixtures the build was just
 * prerendered from. Locally, where the server is `next dev` and nothing is
 * prerendered, it still does the work as it always has.
 */
export default async function globalSetup() {
  if (process.env.E2E_DB_ALREADY_PREPARED) {
    console.log("[e2e] database prepared before the web server started — skipping.");
    return;
  }

  await prepareDatabase();
}

/*
  `tsx e2e/global-setup.ts` (npm run test:e2e:db) runs the preparation on
  its own. One file, so the wipe guard above cannot be bypassed by calling
  the other entry point.
*/
if (require.main === module) {
  prepareDatabase().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
