/**
 * sentry.edge.config.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Edge-runtime Sentry — in this application, proxy.ts only.
 *
 * Small but not skippable: middleware runs on every request and handles
 * both locale routing and the admin auth gate. A failure there takes down
 * every page at once, which is exactly the class of error worth catching.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions, isSentryEnabled } from "@/lib/sentry";

if (isSentryEnabled) {
  Sentry.init({
    ...baseSentryOptions,
    sampleRate: 1.0,
  });
}
