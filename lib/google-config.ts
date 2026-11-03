/**
 * lib/google-config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The Google connection behind /admin/seo (Search Console, URL Inspection,
 * GA4 reporting), editable at /admin/settings/integrations.
 *
 * Until now it lived only in the server's .env (GOOGLE_SA_EMAIL,
 * GOOGLE_SA_PRIVATE_KEY, GSC_SITE_URL, GA4_PROPERTY_ID), so connecting it
 * meant SSH. Values saved in the back office win; the environment stays as
 * the fallback for each one separately.
 *
 * The service account's private key is stored like the LINE token and the
 * Gemini key: a site_settings row lib/settings.ts never reads, AES-256-GCM
 * under a key derived from NEXTAUTH_SECRET with its own separator, never
 * sent back to the browser — the page only learns the account's email.
 *
 * Reads are cached 30 s per process; every write clears the cache.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const KEY = {
  account: "secret:google.serviceAccount",
  gscSiteUrl: "google.gscSiteUrl",
  ga4PropertyId: "google.ga4PropertyId",
} as const;

export type Source = "admin" | "env" | null;

export type GoogleConfig = {
  credentials: { email: string; privateKey: string } | null;
  credentialsSource: Source;
  gscSiteUrl: string | null;
  gscSource: Source;
  ga4PropertyId: string | null;
  ga4Source: Source;
  undecryptable: boolean;
};

function cipherKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to store Google credentials");
  return crypto.createHash("sha256").update(`${secret}::google-v1`).digest();
}

function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cipherKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

function decrypt(stored: string): string {
  const [version, iv, tag, body] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("unrecognised format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", cipherKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

/** "\n" escapes and stray quotes, as keys arrive from .env files. */
export function normalisePrivateKey(value: string): string {
  return value.replace(/^["']|["']$/g, "").replace(/\\n/g, "\n").trim();
}

export type ParsedServiceAccount =
  | { ok: true; email: string; privateKey: string; projectId: string | null }
  | { ok: false; error: "NOT_JSON" | "NOT_SERVICE_ACCOUNT" };

/** The downloaded key file → the two fields the token exchange needs. */
export function parseServiceAccountJson(raw: string): ParsedServiceAccount {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "NOT_JSON" };
  }
  const email = typeof value.client_email === "string" ? value.client_email.trim() : "";
  const key = typeof value.private_key === "string" ? value.private_key : "";
  if (value.type !== "service_account" || !email || !key.includes("PRIVATE KEY")) {
    return { ok: false, error: "NOT_SERVICE_ACCOUNT" };
  }
  return {
    ok: true,
    email,
    privateKey: normalisePrivateKey(key),
    projectId: typeof value.project_id === "string" ? value.project_id : null,
  };
}

/** sc-domain:example.com, or a URL-prefix property with its trailing slash. */
export function normaliseGscSiteUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^sc-domain:/i.test(value)) return `sc-domain:${value.slice(10).trim().toLowerCase()}`;
  if (/^https?:\/\//i.test(value)) return value.endsWith("/") ? value : `${value}/`;
  return `sc-domain:${value.toLowerCase()}`;
}

const TTL_MS = 30_000;
let cache: { at: number; value: GoogleConfig } | null = null;

export function invalidateGoogleConfig(): void {
  cache = null;
}

export async function getGoogleConfig(): Promise<GoogleConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let rows: { key: string; value: string }[] = [];
  try {
    rows = await prisma.siteSetting.findMany({
      where: { key: { in: Object.values(KEY) } },
      select: { key: true, value: true },
    });
  } catch (error) {
    // The database being down must not also take the env fallback away.
    console.error("[google-config] could not read Google settings", error);
  }
  const row = (k: string) => rows.find((r) => r.key === k)?.value?.trim() || null;

  let undecryptable = false;
  let adminCredentials: GoogleConfig["credentials"] = null;
  const stored = row(KEY.account);
  if (stored) {
    try {
      const parsed = JSON.parse(decrypt(stored)) as { email: string; privateKey: string };
      if (parsed.email && parsed.privateKey) adminCredentials = parsed;
    } catch {
      undecryptable = true;
      console.error("[google-config] saved service account cannot be decrypted — was NEXTAUTH_SECRET changed?");
    }
  }

  const envEmail = process.env.GOOGLE_SA_EMAIL?.trim();
  const envKey = process.env.GOOGLE_SA_PRIVATE_KEY?.trim();
  const envCredentials = envEmail && envKey ? { email: envEmail, privateKey: normalisePrivateKey(envKey) } : null;

  const adminGsc = row(KEY.gscSiteUrl);
  const envGsc = process.env.GSC_SITE_URL?.trim() || null;
  const adminGa4 = row(KEY.ga4PropertyId);
  const envGa4 = process.env.GA4_PROPERTY_ID?.trim() || null;

  const value: GoogleConfig = {
    credentials: adminCredentials ?? envCredentials,
    credentialsSource: adminCredentials ? "admin" : envCredentials ? "env" : null,
    gscSiteUrl: adminGsc ?? envGsc,
    gscSource: adminGsc ? "admin" : envGsc ? "env" : null,
    ga4PropertyId: adminGa4 ?? envGa4,
    ga4Source: adminGa4 ? "admin" : envGa4 ? "env" : null,
    undecryptable,
  };
  cache = { at: Date.now(), value };
  return value;
}

/**
 * `serviceAccount` undefined leaves it, null removes it. The two IDs: a
 * string saves it, "" removes it (back to the environment's value).
 */
export async function saveGoogleConfig(
  input: {
    serviceAccount?: { email: string; privateKey: string } | null;
    gscSiteUrl?: string;
    ga4PropertyId?: string;
  },
  actorId?: string,
): Promise<void> {
  const put = (k: string, value: string) =>
    prisma.siteSetting.upsert({
      where: { key: k },
      create: { key: k, value, updatedBy: actorId ?? null },
      update: { value, updatedBy: actorId ?? null },
    });
  const drop = (k: string) => prisma.siteSetting.deleteMany({ where: { key: k } });

  if (input.serviceAccount === null) await drop(KEY.account);
  else if (input.serviceAccount) await put(KEY.account, encrypt(JSON.stringify(input.serviceAccount)));

  for (const [field, key] of [
    ["gscSiteUrl", KEY.gscSiteUrl],
    ["ga4PropertyId", KEY.ga4PropertyId],
  ] as const) {
    const value = input[field];
    if (value === undefined) continue;
    if (value.trim()) await put(key, value.trim());
    else await drop(key);
  }
  invalidateGoogleConfig();
}
