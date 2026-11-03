/**
 * lib/pagespeed/config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The PageSpeed Insights key and the speed tab's schedule, editable at
 * /admin/settings/integrations.
 *
 * Same scheme as lib/ai-config.ts: site_settings rows lib/settings.ts never
 * reads, the key encrypted with AES-256-GCM under a key derived from
 * NEXTAUTH_SECRET with its own domain separator. A saved key wins over
 * PAGESPEED_API_KEY in the environment, which stays as the fallback.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const KEY = {
  apiKey: "secret:psi.key",
  schedule: "psi.schedule",
  strategies: "psi.strategies",
  alertBelow: "psi.alertBelow",
  dailyCap: "psi.dailyCap",
} as const;

export const PSI_SCHEDULES = ["daily", "weekly", "off"] as const;
export type PsiSchedule = (typeof PSI_SCHEDULES)[number];
export const PSI_STRATEGY_SETS = ["both", "mobile", "desktop"] as const;
export type PsiStrategySet = (typeof PSI_STRATEGY_SETS)[number];

/** Google's free quota is 25,000 calls a day per key; this is our own,
 *  far lower ceiling, so a runaway loop stops long before Google's. */
export const DEFAULT_DAILY_CAP = 1000;
export const GOOGLE_DAILY_QUOTA = 25_000;
export const DEFAULT_ALERT_BELOW = 70;

export type PsiConfig = {
  apiKey: string | null;
  keySource: "admin" | "env" | null;
  /** Last four characters of the key in effect, for the card. */
  keyHint: string | null;
  undecryptable: boolean;
  schedule: PsiSchedule;
  strategies: PsiStrategySet;
  /** Mobile performance under this sends a LINE alert; 0 = off. */
  alertBelow: number;
  dailyCap: number;
};

function cipherKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to store the PageSpeed key");
  return crypto.createHash("sha256").update(`${secret}::psi-v1`).digest();
}

export function encryptPsiSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

export function decryptPsiSecret(stored: string): string {
  const [version, iv, tag, body] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("unrecognised PageSpeed secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value ?? "") ? (value as T) : fallback;

function intIn(value: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export async function getPsiConfig(): Promise<PsiConfig> {
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await prisma.siteSetting.findMany({
      where: { key: { in: Object.values(KEY) } },
      select: { key: true, value: true },
    });
  } catch (error) {
    console.error("[pagespeed] could not read settings", error);
  }
  const row = (k: string) => rows.find((r) => r.key === k)?.value;

  let undecryptable = false;
  let adminKey: string | null = null;
  const stored = row(KEY.apiKey);
  if (stored) {
    try {
      adminKey = decryptPsiSecret(stored) || null;
    } catch {
      undecryptable = true;
      console.error("[pagespeed] saved key cannot be decrypted — was NEXTAUTH_SECRET changed?");
    }
  }
  const envKey = process.env.PAGESPEED_API_KEY?.trim() || null;
  const apiKey = adminKey ?? envKey;

  return {
    apiKey,
    keySource: adminKey ? "admin" : envKey ? "env" : null,
    keyHint: apiKey ? apiKey.slice(-4) : null,
    undecryptable,
    schedule: pick(row(KEY.schedule), PSI_SCHEDULES, "weekly"),
    strategies: pick(row(KEY.strategies), PSI_STRATEGY_SETS, "both"),
    alertBelow: intIn(row(KEY.alertBelow), 0, 100, DEFAULT_ALERT_BELOW),
    dailyCap: intIn(row(KEY.dailyCap), 10, GOOGLE_DAILY_QUOTA, DEFAULT_DAILY_CAP),
  };
}

export type PsiConfigInput = {
  apiKey?: string;
  clearKey?: boolean;
  schedule?: PsiSchedule;
  strategies?: PsiStrategySet;
  alertBelow?: number;
  dailyCap?: number;
};

/** Blank key leaves it as it is; `clearKey` removes it. */
export async function savePsiConfig(input: PsiConfigInput, actorId?: string): Promise<void> {
  const put = (k: string, value: string) =>
    prisma.siteSetting.upsert({
      where: { key: k },
      create: { key: k, value, updatedBy: actorId ?? null },
      update: { value, updatedBy: actorId ?? null },
    });

  const key = input.apiKey?.trim();
  if (key) await put(KEY.apiKey, encryptPsiSecret(key));
  if (input.clearKey) await prisma.siteSetting.deleteMany({ where: { key: KEY.apiKey } });
  if (input.schedule) await put(KEY.schedule, input.schedule);
  if (input.strategies) await put(KEY.strategies, input.strategies);
  if (input.alertBelow !== undefined) await put(KEY.alertBelow, String(input.alertBelow));
  if (input.dailyCap !== undefined) await put(KEY.dailyCap, String(input.dailyCap));
}

export function strategiesFor(set: PsiStrategySet): ("mobile" | "desktop")[] {
  return set === "both" ? ["mobile", "desktop"] : [set];
}
