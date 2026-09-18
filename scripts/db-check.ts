/**
 * scripts/db-check.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Diagnoses "Can't reach database server" step by step, so you know which
 * layer is broken instead of guessing.
 *
 * Run with:  npm run db:check
 * ─────────────────────────────────────────────────────────────────────────
 */

import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "../lib/prisma-adapter";

/**
 * Minimal .env loader — this script runs outside the Prisma CLI, which is
 * what normally reads .env for us. Avoids adding a dotenv dependency.
 */
function loadEnv() {
  const file = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(file)) return;

  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    const cleaned = raw.trim();
    if (!cleaned || cleaned.startsWith("#")) continue;

    const eq = cleaned.indexOf("=");
    if (eq === -1) continue;

    const key = cleaned.slice(0, eq).trim();
    const value = cleaned.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const OK = "\x1b[32m✓\x1b[0m";
const FAIL = "\x1b[31m✗\x1b[0m";
const WARN = "\x1b[33m!\x1b[0m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const fixes: string[] = [];

function line(icon: string, label: string, detail = "") {
  console.log(`${icon} ${label}${detail ? `  ${DIM}${detail}${RESET}` : ""}`);
}

/** Can we open a TCP socket to host:port at all? */
function probeTcp(host: string, port: number, timeoutMs = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, host);
  });
}

async function main() {
  console.log("\n  Andaman — database diagnostics\n");

  // ── 1. DATABASE_URL present and parseable ─────────────────────────────
  const raw = process.env.DATABASE_URL;

  if (!raw) {
    line(FAIL, "DATABASE_URL is not set");
    fixes.push("cp .env.example .env   # then fill in DATABASE_URL");
    return report();
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    line(FAIL, "DATABASE_URL is not a valid connection string");
    fixes.push('Expected: postgresql://user:password@host:5432/dbname?schema=public');
    return report();
  }

  const host = url.hostname;
  const port = Number(url.port || 5432);
  const database = url.pathname.replace(/^\//, "");

  line(OK, "DATABASE_URL parsed", `${host}:${port}/${database}`);

  // ── 2. Is anything listening on that port? ────────────────────────────
  const reachable = await probeTcp(host, port);

  if (!reachable) {
    line(FAIL, `Nothing is listening on ${host}:${port}`);
    console.log(
      `\n  ${DIM}The Postgres container isn't running, or it's bound to a different port.${RESET}`,
    );
    fixes.push("npm run db:up                 # start Postgres via Docker");
    fixes.push("docker compose ps             # confirm 'db' is healthy");
    fixes.push("docker info                   # is Docker Desktop actually running?");
    fixes.push(`lsof -i :${port}                  # is another process holding the port?`);
    return report();
  }

  line(OK, `TCP connection to ${host}:${port} succeeded`);

  // ── 3. Can Prisma authenticate and query? ─────────────────────────────
  const prisma = new PrismaClient({ adapter: pgAdapter(), log: ["error"] });

  try {
    await prisma.$queryRaw`SELECT 1`;
    line(OK, "Postgres accepted the credentials");
  } catch (error: any) {
    const code = error?.errorCode ?? error?.code ?? "";

    if (code === "P1000") {
      line(FAIL, "Authentication failed", "wrong user or password");
      fixes.push("Check POSTGRES_USER / POSTGRES_PASSWORD in .env match DATABASE_URL");
      fixes.push(
        "docker compose down -v && npm run db:up   # the volume may hold an older password",
      );
    } else if (code === "P1003") {
      line(FAIL, `Database "${database}" does not exist`);
      fixes.push("Check POSTGRES_DB in .env, then: docker compose down -v && npm run db:up");
    } else {
      line(FAIL, "Query failed", error?.message?.split("\n")[0] ?? String(error));
    }

    await prisma.$disconnect();
    return report();
  }

  // ── 4. Have migrations been applied? ──────────────────────────────────
  try {
    const count = await prisma.project.count();
    line(OK, "Tables exist", `projects table is queryable`);

    if (count === 0) {
      line(WARN, "No projects in the database", "the site will render empty");
      fixes.push("npm run prisma:seed           # insert Trinity Village + progress");
    } else {
      line(OK, `${count} project${count === 1 ? "" : "s"} found`);

      const progress = await prisma.projectProgress.count();
      const leads = await prisma.leadInquiry.count();
      line(OK, `${progress} progress update${progress === 1 ? "" : "s"}, ${leads} lead${leads === 1 ? "" : "s"}`);
    }
  } catch (error: any) {
    const code = error?.code ?? "";
    if (code === "P2021" || /does not exist/i.test(error?.message ?? "")) {
      line(FAIL, "Tables are missing", "migrations have not been applied");
      fixes.push("npm run prisma:migrate        # create tables from schema.prisma");
      fixes.push("npm run prisma:seed           # then load the seed data");
    } else {
      line(FAIL, "Unexpected error", error?.message?.split("\n")[0] ?? String(error));
    }
  }

  await prisma.$disconnect();
  report();
}

function report() {
  if (fixes.length === 0) {
    console.log(`\n  ${OK} Everything checks out — run \`npm run dev\`.\n`);
    return;
  }

  console.log("\n  Next steps:\n");
  for (const fix of fixes) console.log(`    ${fix}`);
  console.log("");
  process.exitCode = 1;
}

main().catch((error) => {
  console.error("\n  db:check crashed:", error);
  process.exit(1);
});
