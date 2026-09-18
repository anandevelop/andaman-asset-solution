/**
 * lib/prisma.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The database client, with the audit trail attached.
 *
 * Two clients, deliberately. `base` is plain and is what the audit
 * extension writes its own rows through — routing the insert back through
 * the extension would have the trail trying to log itself. `prisma` is the
 * extended one and is what everything else imports, so an administrator's
 * writes are recorded without any call site asking for it. See
 * lib/audit/extension.ts for why that is the shape rather than a
 * recordAudit() call in each server action.
 *
 * THE ADAPTER
 *
 * Prisma 7 removed the Rust query engine, so the client no longer speaks to
 * Postgres itself — it goes through a driver adapter wrapping node-postgres.
 * That is why the connection string is read here rather than declared in
 * schema.prisma, which no longer accepts one; prisma.config.ts gives the
 * CLI the same URL for migrations. Two files, one environment variable.
 *
 * The pool is created inside createClient() and therefore shares the
 * global-in-development treatment below. Without it, every hot reload would
 * leave its predecessor's sockets open — the same reason the client itself
 * is cached, but with a connection limit attached to getting it wrong.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from "@prisma/client";
import { pgAdapter } from "@/lib/prisma-adapter";
import { auditExtension } from "@/lib/audit/extension";

function createClient() {
  const base = new PrismaClient({
    adapter: pgAdapter(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  return base.$extends(auditExtension(base));
}

type ExtendedClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
