/**
 * lib/careers/files.ts
 * ─────────────────────────────────────────────────────────────────────────
 * An applicant's attachments: how they reach the Space, and how the
 * application proves which objects are its own.
 *
 * THE FLOW
 *
 *   1. The form asks /api/careers/upload for one file's upload URL, giving
 *      its name, type and size. The server checks all three against
 *      lib/careers/fields.ts and answers with a presigned PUT (private
 *      ACL, the exact size signed in) and an upload token.
 *   2. The browser PUTs the file straight to the Space. It never passes
 *      through this server, so the reverse proxy's body limit is not in
 *      the way and a 5 MB upload does not sit in this process's memory.
 *   3. The form submits the application with the tokens. The server
 *      verifies each token's signature, checks the object is really there
 *      at the signed size, and only then records it.
 *
 * WHY A TOKEN
 *
 * Without it the application endpoint would be taking object keys from a
 * stranger: "attach careers/files/<somebody else's key>" would put another
 * applicant's CV on this application, and into the HR mailbox. The token
 * is the server's own statement — signed with a key the browser never
 * sees — that it issued this key, for this name, type and size, recently.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { deleteS3Object, headPrivateObject, listObjects, presignPrivateUpload, readPrivateObject } from "@/lib/s3";
import { FILE_TYPES, MAX_FILE_BYTES } from "@/lib/careers/fields";

/** Every applicant file lives under this prefix and nowhere else. */
export const CAREERS_PREFIX = "careers/files/";

/** How long an upload token is good for: long enough to fill in the form. */
const TOKEN_TTL_MS = 2 * 60 * 60 * 1000;

export type UploadClaim = { key: string; name: string; contentType: string; size: number; exp: number };

function signingKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to accept job applications");
  return createHmac("sha256", secret).update("careers-upload-v1").digest();
}

const sign = (payload: string) => createHmac("sha256", signingKey()).update(payload).digest("base64url");

/** A file name safe to store, show and put in a mail header. */
export function cleanFileName(raw: string, extension: string): string {
  const base = raw
    .normalize("NFC")
    .replace(/\.[A-Za-z0-9]{1,5}$/, "")
    .replace(/[\u0000-\u001f\u007f"\\/<>:|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "document"}.${extension}`;
}

export function issueUploadToken(claim: Omit<UploadClaim, "exp">, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ ...claim, exp: now + TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyUploadToken(token: string, now = Date.now()): UploadClaim | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as UploadClaim;
    if (
      typeof claim.key !== "string" ||
      !claim.key.startsWith(CAREERS_PREFIX) ||
      typeof claim.name !== "string" ||
      typeof claim.contentType !== "string" ||
      !(claim.contentType in FILE_TYPES) ||
      typeof claim.size !== "number" ||
      claim.size <= 0 ||
      claim.size > MAX_FILE_BYTES ||
      typeof claim.exp !== "number" ||
      claim.exp < now
    ) {
      return null;
    }
    return claim;
  } catch {
    return null;
  }
}

export type UploadTicket = { uploadUrl: string; headers: Record<string, string>; token: string; name: string };

export type UploadRefusal = "TYPE_NOT_ALLOWED" | "TOO_LARGE" | "EMPTY";

/** Step 1: check one file's particulars and hand back where to PUT it. */
export async function ticketForUpload(file: {
  name: string;
  contentType: string;
  size: number;
}): Promise<UploadTicket | { refused: UploadRefusal }> {
  const extension = FILE_TYPES[file.contentType];
  if (!extension) return { refused: "TYPE_NOT_ALLOWED" };
  if (!Number.isInteger(file.size) || file.size <= 0) return { refused: "EMPTY" };
  if (file.size > MAX_FILE_BYTES) return { refused: "TOO_LARGE" };

  const key = `${CAREERS_PREFIX}${randomUUID()}.${extension}`;
  const name = cleanFileName(file.name, extension);
  const { uploadUrl, headers } = await presignPrivateUpload({ key, contentType: file.contentType, size: file.size });

  return { uploadUrl, headers, name, token: issueUploadToken({ key, name, contentType: file.contentType, size: file.size }) };
}

/**
 * Step 3: the claims behind a submission's tokens, each confirmed against
 * the Space. A token whose object is missing or the wrong size is dropped
 * rather than failing the application — the applicant's details still
 * arrive, and `dropped` says how many attachments did not.
 */
export async function confirmUploads(tokens: string[]): Promise<{ files: UploadClaim[]; dropped: number }> {
  const seen = new Set<string>();
  const files: UploadClaim[] = [];
  let dropped = 0;

  for (const token of tokens) {
    const claim = verifyUploadToken(token);
    if (!claim || seen.has(claim.key)) {
      dropped += 1;
      continue;
    }
    seen.add(claim.key);
    const head = await headPrivateObject(claim.key).catch(() => null);
    if (!head || head.size !== claim.size) {
      dropped += 1;
      continue;
    }
    files.push(claim);
  }
  return { files, dropped };
}

export const readApplicantFile = (key: string) => readPrivateObject(key);

/** Best effort: a file the Space will not delete must not keep a row alive. */
export async function deleteApplicantFiles(keys: string[]): Promise<number> {
  let failed = 0;
  for (const key of keys) {
    if (!key.startsWith(CAREERS_PREFIX)) continue;
    try {
      await deleteS3Object(key);
    } catch (error) {
      failed += 1;
      console.error("[careers] could not delete a file from the Space", error);
    }
  }
  return failed;
}

/**
 * Uploads that never became part of an application: the visitor attached a
 * file and left. `known` is every key the database holds; anything else
 * under the prefix older than a day is nobody's and goes.
 */
export async function deleteOrphanUploads(known: Set<string>, now = Date.now()): Promise<number> {
  const objects = await listObjects(CAREERS_PREFIX);
  const stale = objects.filter(
    (object) => !known.has(object.key) && object.lastModified && now - object.lastModified.getTime() > 24 * 60 * 60 * 1000,
  );
  await deleteApplicantFiles(stale.map((object) => object.key));
  return stale.length;
}
