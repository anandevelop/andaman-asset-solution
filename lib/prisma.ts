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
 * ─────────────────────────────────────────────────────────────────────────
 */

import { PrismaClient } from "@prisma/client";
import { auditExtension } from "@/lib/audit/extension";

function createClient() {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  return base.$extends(auditExtension(base));
}

type ExtendedClient = ReturnType<typeof createClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
