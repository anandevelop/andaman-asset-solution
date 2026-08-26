/**
 * lib/sentry.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Shared Sentry configuration and helpers.
 *
 * Scope is deliberately narrow: exceptions only. No performance tracing,
 * no session replay. Tracing burns the free-tier quota fastest and this
 * application has one server and a handful of routes; replay records the
 * DOM of pages carrying names, phone numbers and email addresses, which is
 * a PDPA question nobody has answered. Both are one config line away when
 * there is a reason.
 *
 * Sentry is entirely optional. With SENTRY_DSN unset, `init` is never
 * called and every helper is a no-op — local development and CI produce no
 * network traffic.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from "@sentry/nextjs";

/**
 * NEXT_PUBLIC_ so the browser bundle can read it too. A DSN is a write-only
 * ingest key and is expected to be public — it is visible in the network
 * tab of any site running Sentry.
 */
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ?? process.env.SENTRY_DSN;

export const isSentryEnabled = Boolean(SENTRY_DSN);

/**
 * Errors that are noise, not signal.
 *
 * Each of these fires regularly in normal operation and none is
 * actionable. Left unfiltered they bury the real ones — the fastest way to
 * make a team stop reading Sentry alerts is to send them a hundred a day
 * they cannot fix.
 */
const IGNORED_ERRORS = [
  // Next.js control-flow exceptions. redirect() and notFound() are
  // implemented by throwing; they are not failures.
  "NEXT_REDIRECT",
  "NEXT_NOT_FOUND",
  // The visitor navigated away mid-request.
  "AbortError",
  "The user aborted a request",
  // Browser extensions and injected scripts, not our code.
  "ResizeObserver loop limit exceeded",
  "ResizeObserver loop completed with undelivered notifications",
  "Non-Error promise rejection captured",
  // Offline or flaky mobile connections.
  "NetworkError when attempting to fetch resource",
  "Failed to fetch",
  "Load failed",
];

/** Third-party scripts we do not control and cannot fix. */
const DENY_URLS = [
  /extensions\//i,
  /^chrome:\/\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /googletagmanager\.com/i,
  /connect\.facebook\.net/i,
  /google-analytics\.com/i,
  /recaptcha/i,
];

/**
 * Strip anything that could carry personal data before it leaves the
 * process.
 *
 * Sentry's own `sendDefaultPii: false` covers the obvious cases, but a
 * lead form's request body is not obvious to it — and that body contains a
 * name, an email and a phone number. Under PDPA those do not belong in a
 * third-party error tracker, so the whole payload is dropped rather than
 * attempting to redact fields individually.
 */
function scrub(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;

    if (event.request.headers) {
      for (const header of ["authorization", "cookie", "x-forwarded-for"]) {
        delete event.request.headers[header];
      }
    }

    // Query strings can carry a callbackUrl or a filter; the path alone is
    // enough to locate the failure.
    if (event.request.url) {
      event.request.url = event.request.url.split("?")[0];
    }
  }

  // Identify the user by opaque id only — never name or email.
  if (event.user) {
    event.user = { id: event.user.id };
  }

  return event;
}

/** Options shared by the client, server and edge runtimes. */
export const baseSentryOptions: Sentry.NodeOptions & Sentry.BrowserOptions = {
  dsn: SENTRY_DSN,

  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",

  // Ties an issue to the commit that introduced it.
  release: process.env.GIT_COMMIT_SHA,

  // Errors only — see the note at the top of this file.
  tracesSampleRate: 0,

  // Never send names, emails, IPs or request bodies.
  sendDefaultPii: false,

  ignoreErrors: IGNORED_ERRORS,
  denyUrls: DENY_URLS,

  // Local runs should not consume production quota. Set
  // SENTRY_DEBUG_LOCAL=true to test the integration itself.
  enabled:
    process.env.NODE_ENV === "production" ||
    process.env.SENTRY_DEBUG_LOCAL === "true",

  beforeSend: scrub,
};

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Report a handled error with context.
 *
 * For failures that are caught and recovered from but still worth knowing
 * about — a LINE push that never landed, an S3 signature that failed. These
 * never reach an error boundary, so without this they are invisible outside
 * the server log.
 */
export function reportError(
  error: unknown,
  context: { tags?: Record<string, string>; extra?: Record<string, unknown> } = {},
): void {
  if (!isSentryEnabled) return;

  Sentry.withScope((scope) => {
    if (context.tags) scope.setTags(context.tags);
    if (context.extra) scope.setExtras(context.extra);

    Sentry.captureException(error);
  });
}

/**
 * Attach the signed-in admin to subsequent events — by id only.
 *
 * Knowing that three different editors hit the same error, rather than one
 * editor hitting it three times, is the difference between a bug and a
 * training issue.
 */
export function identifyUser(userId: string | null): void {
  if (!isSentryEnabled) return;

  Sentry.setUser(userId ? { id: userId } : null);
}
