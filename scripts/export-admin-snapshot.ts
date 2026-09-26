/**
 * scripts/export-admin-snapshot.ts
 * ─────────────────────────────────────────────────────────────────────────
 * One-off: dump a read-only snapshot of what the admin currently holds, so
 * the admin UX mockup can be rebuilt on real data.
 *
 *   npx tsx --env-file=.env scripts/export-admin-snapshot.ts
 *
 * → writes "Claude outputs/admin-snapshot.json"
 *
 * Read-only (count + findMany). Secrets are never exported (auth tables,
 * hashes, tokens, 2FA, IPs, user agents) and customer contact details are
 * masked (name → first name + initial, email/phone → partial).
 * ─────────────────────────────────────────────────────────────────────────
 */
import fs from "node:fs";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { pgAdapter } from "../lib/prisma-adapter";

const prisma = new PrismaClient({ adapter: pgAdapter() });

const SKIP_MODELS = new Set(["Account", "Session", "VerificationToken", "RecoveryCode"]);
const DROP_FIELD = /(password|hash|secret|token|twoFactor|totp|recovery|ipAddress|userAgent|credentialEpoch)/i;
const PII_MODELS = new Set(["LeadInquiry", "EventRegistration", "Appointment", "LeadNote"]);
const SAMPLE = 40;

const maskName = (v: string) => {
  const parts = v.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};
const maskEmail = (v: string) => v.replace(/^(.{2})[^@]*(@.*)$/, "$1***$2");
const maskPhone = (v: string) => v.replace(/\d(?=\d{3})/g, "•");

function clean(model: string, row: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (DROP_FIELD.test(k)) continue;
    let val = v;
    if (PII_MODELS.has(model) && typeof val === "string") {
      if (/^(name|fullName|firstName|lastName|customerName)$/i.test(k)) val = maskName(val);
      else if (/email/i.test(k)) val = maskEmail(val);
      else if (/phone|whatsapp|line/i.test(k)) val = maskPhone(val);
    }
    if (typeof val === "string" && val.length > 400) val = val.slice(0, 400) + "…";
    out[k] = val;
  }
  return out;
}

async function main() {
  const snapshot: Record<string, { count: number; sample: unknown[] }> = {};
  for (const model of Prisma.dmmf.datamodel.models) {
    if (SKIP_MODELS.has(model.name)) continue;
    const key = model.name[0].toLowerCase() + model.name.slice(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const delegate = (prisma as any)[key];
    if (!delegate) continue;
    try {
      const count = await delegate.count();
      const hasCreated = model.fields.some((f) => f.name === "createdAt");
      const rows = await delegate.findMany({
        take: SAMPLE,
        ...(hasCreated ? { orderBy: { createdAt: "desc" } } : {}),
      });
      snapshot[model.name] = { count, sample: rows.map((r: Record<string, unknown>) => clean(model.name, r)) };
      console.log(`${model.name.padEnd(28)} ${count}`);
    } catch (e) {
      console.warn(`skip ${model.name}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  const file = path.join(process.cwd(), "Claude outputs", "admin-snapshot.json");
  fs.writeFileSync(
    file,
    JSON.stringify({ exportedAt: new Date().toISOString(), snapshot }, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v, 2),
  );
  console.log(`\n✓ wrote ${file}`);
}

main().finally(() => prisma.$disconnect());
