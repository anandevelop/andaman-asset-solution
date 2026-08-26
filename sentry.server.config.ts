/**
 * sentry.server.config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Node-runtime Sentry: route handlers, server components, server actions.
 *
 * Sampled at 100%, unlike the browser. A server error is ours by
 * definition — there is no extension or ad blocker to blame — so every one
 * is worth seeing, and the volume is orders of magnitude lower.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions, isSentryEnabled } from "@/lib/sentry";

if (isSentryEnabled) {
  Sentry.init({
    ...baseSentryOptions,
    sampleRate: 1.0,

    // Prisma's own integration is not enabled: it is a tracing feature,
    // and tracing is off. Query errors still arrive as exceptions.
  });
}
