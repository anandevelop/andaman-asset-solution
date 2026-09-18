/**
 * app/api/validate-email/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/validate-email — inline quality check for the lead form's
 * email field (components/LeadForm.tsx calls this on blur, once the
 * value already passes zod's own `.email()` shape check).
 *
 * ADVISORY INFRASTRUCTURE, NOT A GATE
 *
 * Every failure mode here — a DNS timeout, an exception, the rate limit
 * firing — resolves "unknown" rather than throwing or blocking, because a
 * visitor who cannot submit their real enquiry over an infrastructure
 * hiccup is a worse outcome than one bad lead reaching the CRM. The one
 * deliberate exception is "disposable": the client turns that into a
 * hard field error, and app/api/leads/route.ts enforces the same rule
 * again server-side, since a script posting straight at that endpoint
 * never went through this one at all.
 *
 * Nothing here is persisted, and only the domain is ever logged — this
 * endpoint sees an address before the visitor has ticked the consent box,
 * and the full address is not this route's to keep a record of.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { resolveMx } from "node:dns/promises";
import { z } from "zod";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { emailDomain, isDisposableDomain, suggestEmailCorrection } from "@/lib/email-quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = RATE_LIMITS.emailCheck;

/** This call sits between a visitor and a text field — anything slower
 *  than this is treated the same as a domain that never answers. */
const MX_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 60 * 60_000;
/** Hard cap so a long-lived process fed many distinct domains cannot grow
 *  this map without bound. */
const CACHE_MAX_ENTRIES = 2000;

export type Verdict =
  | { status: "deliverable" }
  | { status: "disposable" }
  | { status: "typo"; suggestion: string }
  | { status: "no_mx" }
  | { status: "unknown" };

type CacheEntry = { hasMx: boolean; expiresAt: number };

/*
  Cached per DOMAIN, not per address — gmail.com should resolve once per
  boot, not once per keystroke across every visitor who happens to type a
  Gmail address. Only a *definite* answer (see hasMxRecord below) is ever
  cached; a timeout or resolver error is not, so a transient DNS blip
  cannot brand a real domain "no_mx" for the next hour.
*/
const mxCache = new Map<string, CacheEntry>();

function cacheGet(domain: string): boolean | null {
  const entry = mxCache.get(domain);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    mxCache.delete(domain);
    return null;
  }
  return entry.hasMx;
}

function cacheSet(domain: string, hasMx: boolean) {
  if (mxCache.size >= CACHE_MAX_ENTRIES) {
    // Map iteration order is insertion order, so this evicts the oldest
    // entry — a plain FIFO, which is all a cache this small needs.
    const oldest = mxCache.keys().next().value;
    if (oldest !== undefined) mxCache.delete(oldest);
  }
  mxCache.set(domain, { hasMx, expiresAt: Date.now() + CACHE_TTL_MS });
}

function isDnsErrorCode(error: unknown, ...codes: string[]): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    codes.includes((error as { code: unknown }).code as string)
  );
}

/**
 * true/false is a real answer about the domain (and gets cached); null
 * means the question could not be answered — a timeout, a resolver
 * failure, anything that is about *our* infrastructure rather than a fact
 * about the domain — and is never cached.
 *
 * Node's resolveMx *rejects* for a domain with no MX record at all (code
 * ENOTFOUND for a domain that does not exist, ENODATA for one that exists
 * but publishes none) rather than resolving an empty array — both of
 * those are the real "this domain cannot receive mail" signal this
 * function exists to surface as `false`. Every other rejection (a
 * timeout, ECONNREFUSED, SERVFAIL, our own synthetic timeout error below)
 * says nothing about the domain and returns null instead.
 */
async function hasMxRecord(domain: string): Promise<boolean | null> {
  const cached = cacheGet(domain);
  if (cached !== null) return cached;

  try {
    const records = await Promise.race([
      resolveMx(domain),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("validate-email: MX lookup timed out")), MX_TIMEOUT_MS);
      }),
    ]);
    const hasMx = records.length > 0;
    cacheSet(domain, hasMx);
    return hasMx;
  } catch (error) {
    if (isDnsErrorCode(error, "ENOTFOUND", "ENODATA")) {
      cacheSet(domain, false);
      return false;
    }
    return null;
  }
}

const bodySchema = z.object({ email: z.string().trim().email() });

/**
 * The decision itself, apart from the request/response plumbing —
 * extracted so tests/api/validate-email.test.ts can exercise the
 * disposable/MX/typo ordering directly, with node:dns/promises mocked,
 * without going through a Request/NextResponse round trip.
 */
export async function getEmailVerdict(email: string): Promise<Verdict> {
  const domain = emailDomain(email);
  if (!domain) return { status: "unknown" };

  if (isDisposableDomain(domain)) return { status: "disposable" };

  const hasMx = await hasMxRecord(domain);

  // Domain only, never the address — see this file's header.
  console.info(`[validate-email] domain=${domain} hasMx=${hasMx}`);

  if (hasMx === null) return { status: "unknown" };
  if (hasMx) return { status: "deliverable" };

  // No MX, confirmed — worth a typo correction before giving up. A
  // domain that resolves is never second-guessed: this line only runs
  // once hasMx has already come back false.
  const suggestion = suggestEmailCorrection(email);
  if (suggestion) return { status: "typo", suggestion };

  return { status: "no_mx" };
}

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  const limit = rateLimit(`email-check:${ip}`, RATE_LIMIT);

  // Over the limit is not the visitor's fault and the UI has nothing
  // useful to say about it — same "unknown" a DNS timeout gets, not a 429.
  if (!limit.ok) {
    return NextResponse.json<Verdict>({ status: "unknown" });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json<Verdict>({ status: "unknown" });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json<Verdict>({ status: "unknown" });
  }

  return NextResponse.json<Verdict>(await getEmailVerdict(parsed.data.email));
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}
