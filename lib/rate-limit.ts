/**
 * lib/rate-limit.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Minimal in-memory fixed-window rate limiter for public API routes.
 *
 * Scope & limits (deliberate for Phase 2):
 *  • Per-process only — a multi-instance deploy gets N× the limit. Swap the
 *    store for Redis/Upstash before horizontal scaling (Phase 4).
 *  • Not a bot defence. reCAPTCHA keys already exist in .env.example and
 *    should be wired up alongside this, not instead of it.
 * ─────────────────────────────────────────────────────────────────────────
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Opportunistic sweep so the Map can't grow unbounded on a long-lived process.
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;

function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  limit: number;
  remaining: number;
  /** Seconds until the window resets — use for the Retry-After header. */
  retryAfter: number;
};

/**
 * Escape hatch for the end-to-end suite.
 *
 * Every request in an e2e run arrives from 127.0.0.1, so the limiter sees
 * one client submitting a dozen enquiries in ninety seconds and — correctly
 * — starts refusing them. The tests then fail on the limiter rather than on
 * the behaviour under test.
 *
 * Read once at module load and never re-read, so it cannot be flipped by a
 * request. It is also NEXT_PUBLIC-free and unset everywhere except
 * playwright.config.ts: turning this on in production would remove the only
 * brute-force protection on the sign-in route.
 */
const DISABLED = process.env.RATE_LIMIT_DISABLED === "1";

export function rateLimit(
  key: string,
  {
    limit = 5,
    windowMs = 10 * 60_000,
    check = false,
  }: {
    limit?: number;
    windowMs?: number;
    /**
     * Read the bucket without consuming from it.
     *
     * For paths where only *failures* should count — a correct password
     * must not push the user closer to a lockout caused by someone else
     * guessing at their address.
     */
    check?: boolean;
  } = {},
): RateLimitResult {
  if (DISABLED) return { ok: true, limit, remaining: limit, retryAfter: 0 };

  const now = Date.now();
  sweep(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (check) return { ok: true, limit, remaining: limit, retryAfter: 0 };

    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, limit, remaining: limit - 1, retryAfter: 0 };
  }

  const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);

  if (check) {
    return {
      ok: bucket.count < limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfter,
    };
  }

  bucket.count += 1;

  return {
    ok: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfter,
  };
}

/** Best-effort client IP from proxy headers (Vercel / nginx / Cloudflare). */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  return (
    headers.get("cf-connecting-ip") ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Clear a bucket early.
 *
 * Used by the sign-in path: a successful login should not leave the user
 * one typo away from a lockout for the rest of the window. Only call this
 * after the credential check has actually passed — clearing on any attempt
 * would make the limiter useless.
 */
export function resetRateLimit(key: string): void {
  buckets.delete(key);
}

// ─────────────────────────────────────────────────────────────────────────
// Named policies
//
// Defined here rather than at each call site so the numbers are visible
// side by side. A limit that looks reasonable alone is often obviously
// wrong next to its neighbours.
// ─────────────────────────────────────────────────────────────────────────

export const RATE_LIMITS = {
  /** Public lead capture. Generous — a genuine enquirer may resubmit. */
  leads: { limit: 5, windowMs: 10 * 60_000 },

  /** Event RSVP. Rarer action than an enquiry, so tighter. */
  rsvp: { limit: 4, windowMs: 10 * 60_000 },

  /** Presigned uploads, keyed per admin user: a gallery is many files. */
  presign: { limit: 60, windowMs: 10 * 60_000 },

  /**
   * Failed sign-in attempts per email. Ten is well above a human
   * mistyping and far below anything useful for guessing a 12-character
   * password. Keyed on email rather than IP so a distributed attempt on
   * one account is still caught — and so one office behind a single NAT
   * cannot lock out its own colleagues.
   */
  login: { limit: 10, windowMs: 15 * 60_000 },

  /**
   * Failed second-factor attempts, keyed per user. Tighter than the
   * password limiter: at this point the password is already correct, so
   * every failure is either a typo, a drifting phone clock, or someone
   * guessing six digits — and six digits fall to brute force fast enough
   * that the limit, not the entropy, is what protects the account.
   */
  twoFactor: { limit: 6, windowMs: 15 * 60_000 },

  /** Unsigned LINE webhook posts — anything reaching this is not LINE. */
  webhook: { limit: 30, windowMs: 60_000 },

  /**
   * Anonymous cookie-consent decision counters. One real decision per
   * pageload at most, so this only needs to be generous enough that a
   * banner reopened a few times via "Cookie Preferences" doesn't trip it.
   */
  cookieConsent: { limit: 20, windowMs: 60_000 },

  /**
   * Anonymous 404 reporting (app/api/not-found/route.ts). One real hit per
   * genuinely broken link per pageload — generous enough for someone
   * clicking around a stale bookmark a few times, tight enough that
   * scripting requests to a thousand made-up paths cannot flood
   * NotFoundHit with noise or spend the redirect lookup's DB query budget.
   */
  notFound: { limit: 20, windowMs: 60_000 },

  /**
   * Article view beacons. Loose on purpose — this is a counter, not a
   * gate, and an office of ten people reading the newsroom over lunch
   * must not start dropping counts. It is here to stop one client
   * hammering the endpoint into a write loop, nothing more.
   */
  pageView: { limit: 60, windowMs: 60_000 },

  /** Inline email check. Generous — one visitor may correct the field a few times. */
  emailCheck: { limit: 30, windowMs: 10 * 60_000 },
} as const;
