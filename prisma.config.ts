/**
 * prisma.config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Configuration for the Prisma CLI — `migrate`, `db push`, `studio`, `db
 * seed`. New in Prisma 7, and not optional: the schema is no longer allowed
 * to carry a connection URL, so this is where the CLI is told how to reach
 * the database.
 *
 * It does NOT configure the client the application runs on. That is built
 * in lib/prisma.ts, from the same DATABASE_URL, through a driver adapter —
 * see the note there about why there are now two places and only one
 * source.
 *
 * The seed command moved here too, from the "prisma" block in package.json,
 * which Prisma 7 no longer reads.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { loadEnvConfig } from "@next/env";
import { defineConfig, env } from "prisma/config";

/*
  Prisma 7 reads this file before anything has loaded .env, and then fails
  outright on a missing DATABASE_URL rather than falling back — so the file
  loads it itself.

  @next/env rather than dotenv: it is already a dependency, and it applies
  the same .env / .env.local / .env.development precedence the application
  gets, so the CLI and the running app cannot end up pointed at different
  databases by a file one of them ignores.
*/
loadEnvConfig(process.cwd());

export default defineConfig({
  schema: "prisma/schema.prisma",

  migrations: {
    seed: "tsx prisma/seed.ts",
  },

  datasource: {
    url: env("DATABASE_URL"),

    /*
      A scratch database the CLI creates, replays every migration into, and
      drops — used by `migrate dev` to detect drift, and required by
      `migrate diff --from-migrations`, which is how this repo checks that
      the migrations directory really reproduces schema.prisma before a
      change is committed.

      SHADOW_DATABASE_URL if it is set, otherwise a database beside the main
      one on the same server. Never the development database itself: the
      shadow gets reset.
    */
    shadowDatabaseUrl:
      process.env.SHADOW_DATABASE_URL ??
      process.env.DATABASE_URL?.replace(
        /\/([^/?]+)(\?|$)/,
        (_match, name, tail) => `/${name}_shadow${tail}`,
      ),
  },
});
