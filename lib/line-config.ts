/**
 * lib/line-config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Where the LINE lead alerts get their credentials and recipients.
 *
 * Edited from /admin/settings/integrations, so an admin can connect the
 * Official Account, choose which chats receive alerts and switch the whole
 * thing off without anyone touching the server's .env. The environment
 * variables still work (LINE_CHANNEL_SECRET, LINE_CHANNEL_ACCESS_TOKEN,
 * LINE_NOTIFY_TO) and are the fallback: a value saved in the back office
 * wins over the same value in the environment.
 *
 * STORAGE
 *
 * Rows in site_settings, under keys lib/settings.ts does not know about,
 * so none of this can reach the public site's settings object. The two
 * credentials are encrypted at rest with AES-256-GCM under a key derived
 * from NEXTAUTH_SECRET (the same scheme as the TOTP secrets in
 * lib/totp.ts, with its own domain separator). A database dump is
 * therefore not a working bot token. Rotating NEXTAUTH_SECRET makes the
 * stored credentials unreadable: they then read as "not set" and have to
 * be pasted again, which the integrations page says.
 *
 * RECIPIENTS
 *
 * When the OA is added to a group, the webhook records that group here
 * switched OFF. Anybody can add a public OA to a chat of their own, so a
 * group only starts receiving customers' names and phone numbers once an
 * admin has switched it on.
 *
 * Reads are cached for 30 seconds per process — one lead must not cost
 * four queries — and every write clears the cache.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const KEY = {
  secret: "secret:line.channelSecret",
  token: "secret:line.accessToken",
  enabled: "line.enabled",
  destinations: "line.destinations",
} as const;

export type LineDestinationType = "group" | "room" | "user";

export type LineDestination = {
  id: string;
  type: LineDestinationType;
  /** Group name from LINE, or what the admin typed. */
  name: string;
  enabled: boolean;
  addedAt: string;
  /** "join": the OA was added to the chat. "env": from LINE_NOTIFY_TO. */
  source: "join" | "manual" | "env";
};

export type CredentialSource = "admin" | "env" | null;

export type LineConfig = {
  channelSecret: string | null;
  accessToken: string | null;
  secretSource: CredentialSource;
  tokenSource: CredentialSource;
  /** Master switch. On unless an admin turned it off. */
  enabled: boolean;
  destinations: LineDestination[];
  /** A stored credential could not be decrypted (NEXTAUTH_SECRET changed). */
  undecryptable: boolean;
};

// ── Encryption ──────────────────────────────────────────────────────────

function key(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to store LINE credentials");
  return crypto.createHash("sha256").update(`${secret}::line-v1`).digest();
}

export function encryptLineSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), body.toString("base64")].join(":");
}

/** Throws when the value was not written with the current key. */
export function decryptLineSecret(stored: string): string {
  const [version, iv, tag, body] = stored.split(":");
  if (version !== "v1" || !iv || !tag || !body) throw new Error("unrecognised LINE secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
}

// ── IDs ─────────────────────────────────────────────────────────────────

/** U… user, C… group, R… room: a letter and 32 hex digits. */
export function parseLineId(raw: string): { id: string; type: LineDestinationType } | null {
  const id = raw.trim();
  if (!/^[UCR][0-9a-f]{32}$/.test(id)) return null;
  return { id, type: id[0] === "U" ? "user" : id[0] === "C" ? "group" : "room" };
}

function envDestinations(): LineDestination[] {
  return (process.env.LINE_NOTIFY_TO ?? "")
    .split(",")
    .map((raw) => parseLineId(raw) ?? (raw.trim() ? { id: raw.trim(), type: "user" as const } : null))
    .filter((x): x is { id: string; type: LineDestinationType } => x !== null)
    .map(({ id, type }) => ({ id, type, name: "", enabled: true, addedAt: "", source: "env" as const }));
}

function parseDestinations(raw: string | undefined): LineDestination[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter(
      (d): d is LineDestination =>
        d && typeof d.id === "string" && typeof d.enabled === "boolean" && typeof d.type === "string",
    );
  } catch {
    return [];
  }
}

// ── Read ────────────────────────────────────────────────────────────────

const TTL_MS = 30_000;
let cache: { at: number; value: LineConfig } | null = null;

export function invalidateLineConfig(): void {
  cache = null;
}

export async function getLineConfig(): Promise<LineConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let rows: { key: string; value: string }[] = [];
  try {
    rows = await prisma.siteSetting.findMany({
      where: { key: { in: Object.values(KEY) } },
      select: { key: true, value: true },
    });
  } catch (error) {
    // The database being down must not also take the env fallback away.
    console.error("[line] could not read LINE settings", error);
  }
  const row = (k: string) => rows.find((r) => r.key === k)?.value;

  let undecryptable = false;
  const stored = (k: string): string | null => {
    const value = row(k);
    if (!value) return null;
    try {
      return decryptLineSecret(value) || null;
    } catch {
      undecryptable = true;
      console.error(`[line] ${k} cannot be decrypted — was NEXTAUTH_SECRET changed? Paste it again in the back office.`);
      return null;
    }
  };

  const adminSecret = stored(KEY.secret);
  const adminToken = stored(KEY.token);
  const envSecret = process.env.LINE_CHANNEL_SECRET?.trim() || null;
  const envToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim() || null;

  const saved = parseDestinations(row(KEY.destinations));
  const fromEnv = envDestinations().filter((e) => !saved.some((d) => d.id === e.id));

  const value: LineConfig = {
    channelSecret: adminSecret ?? envSecret,
    accessToken: adminToken ?? envToken,
    secretSource: adminSecret ? "admin" : envSecret ? "env" : null,
    tokenSource: adminToken ? "admin" : envToken ? "env" : null,
    enabled: row(KEY.enabled) !== "false",
    destinations: [...saved, ...fromEnv],
    undecryptable,
  };

  cache = { at: Date.now(), value };
  return value;
}

/** Everything needed to actually post an alert. */
export async function getActiveRecipients(): Promise<{ token: string; to: string[] } | null> {
  const config = await getLineConfig();
  const to = config.destinations.filter((d) => d.enabled).map((d) => d.id);
  if (!config.enabled || !config.accessToken || to.length === 0) return null;
  return { token: config.accessToken, to };
}

// ── Write ───────────────────────────────────────────────────────────────

async function put(k: string, value: string, actorId?: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: k },
    create: { key: k, value, updatedBy: actorId ?? null },
    update: { value, updatedBy: actorId ?? null },
  });
  invalidateLineConfig();
}

/** A blank value leaves that credential as it is; `clear` removes it. */
export async function saveLineCredentials(
  input: { channelSecret?: string; accessToken?: string; clear?: ("secret" | "token")[] },
  actorId?: string,
): Promise<void> {
  const secret = input.channelSecret?.trim();
  const token = input.accessToken?.trim();
  if (secret) await put(KEY.secret, encryptLineSecret(secret), actorId);
  if (token) await put(KEY.token, encryptLineSecret(token), actorId);
  const clear = (input.clear ?? []).map((c) => (c === "secret" ? KEY.secret : KEY.token));
  if (clear.length) {
    await prisma.siteSetting.deleteMany({ where: { key: { in: clear } } });
    invalidateLineConfig();
  }
}

export async function setLineEnabled(enabled: boolean, actorId?: string): Promise<void> {
  await put(KEY.enabled, enabled ? "true" : "false", actorId);
}

/**
 * Only the destinations saved in the database. Env-only entries are shown
 * in the back office but are not written back unless an admin edits one.
 */
async function savedDestinations(): Promise<LineDestination[]> {
  const row = await prisma.siteSetting.findUnique({ where: { key: KEY.destinations } });
  return parseDestinations(row?.value);
}

async function writeDestinations(list: LineDestination[], actorId?: string): Promise<void> {
  await put(KEY.destinations, JSON.stringify(list), actorId);
}

/**
 * Add or update one recipient. An env entry being edited is copied in, so
 * switching it off in the back office sticks.
 */
export async function upsertLineDestination(
  destination: Omit<LineDestination, "addedAt"> & { addedAt?: string },
  actorId?: string,
): Promise<void> {
  const list = await savedDestinations();
  const index = list.findIndex((d) => d.id === destination.id);
  const next: LineDestination = {
    ...destination,
    addedAt: destination.addedAt || list[index]?.addedAt || new Date().toISOString(),
    source: destination.source === "env" ? "manual" : destination.source,
  };
  if (index >= 0) list[index] = next;
  else list.push(next);
  await writeDestinations(list, actorId);
}

export async function removeLineDestination(id: string, actorId?: string): Promise<void> {
  const list = await savedDestinations();
  await writeDestinations(
    list.filter((d) => d.id !== id),
    actorId,
  );
}

/**
 * Called by the webhook when the OA joins or leaves a chat. A new chat is
 * recorded switched off; one the admin already knows keeps its switch, but
 * picks up a fresh name.
 */
export async function recordLineChat(
  id: string,
  type: LineDestinationType,
  name: string,
  event: "join" | "leave",
): Promise<void> {
  const list = await savedDestinations();
  const existing = list.find((d) => d.id === id);

  if (event === "leave") {
    if (!existing) return;
    existing.enabled = false;
  } else if (existing) {
    if (name) existing.name = name;
  } else {
    list.push({ id, type, name, enabled: false, addedAt: new Date().toISOString(), source: "join" });
  }

  await writeDestinations(list);
}

// ── Delivery log ────────────────────────────────────────────────────────

/**
 * The last few alert attempts, shown on the integrations page. Without it
 * a lead whose alert never arrived leaves no trace an admin can see: the
 * reason (switched off, no chat on, LINE refusing the message) was only in
 * the server's logs.
 */
export type LineDelivery = {
  at: string;
  kind: "lead" | "registration" | "test";
  outcome: "sent" | "failed" | "skipped";
  /** Why it was skipped, or what LINE answered when it failed. */
  detail: string;
};

const DELIVERIES_KEY = "line.deliveries";
const DELIVERIES_KEPT = 10;

export async function getLineDeliveries(): Promise<LineDelivery[]> {
  const row = await prisma.siteSetting.findUnique({ where: { key: DELIVERIES_KEY } }).catch(() => null);
  if (!row) return [];
  try {
    const list = JSON.parse(row.value);
    return Array.isArray(list) ? (list as LineDelivery[]) : [];
  } catch {
    return [];
  }
}

/** Best-effort: a failure to write the log never affects the alert. */
export async function recordLineDelivery(entry: Omit<LineDelivery, "at">): Promise<void> {
  try {
    const list = await getLineDeliveries();
    const next = [{ ...entry, at: new Date().toISOString(), detail: entry.detail.slice(0, 500) }, ...list].slice(
      0,
      DELIVERIES_KEPT,
    );
    await prisma.siteSetting.upsert({
      where: { key: DELIVERIES_KEY },
      create: { key: DELIVERIES_KEY, value: JSON.stringify(next) },
      update: { value: JSON.stringify(next) },
    });
  } catch (error) {
    console.error("[line] could not record delivery", error);
  }
}

/** Why nothing would be sent right now, or null when alerts can go out. */
export async function lineSkipReason(): Promise<string | null> {
  const config = await getLineConfig();
  if (!config.enabled) return "SWITCHED_OFF";
  if (!config.accessToken) return "NO_TOKEN";
  if (!config.destinations.some((d) => d.enabled)) return "NO_ACTIVE_CHAT";
  return null;
}
