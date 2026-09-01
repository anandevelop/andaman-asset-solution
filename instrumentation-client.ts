/**
 * instrumentation-client.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Browser-side Sentry. Loaded by @sentry/nextjs before the app mounts.
 *
 * Everything meaningful lives in lib/sentry.ts so the three runtimes cannot
 * drift apart — particularly the PII scrubbing, which has to behave
 * identically wherever an event originates.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from "@sentry/nextjs";
import { baseSentryOptions, isSentryEnabled } from "@/lib/sentry";

if (isSentryEnabled) {
  Sentry.init({
    ...baseSentryOptions,

    // Browser errors are noisier than server ones — extensions, ad
    // blockers, ancient mobile browsers. Half is plenty to spot a real
    // regression without spending quota on the long tail.
    sampleRate: 0.5,

    integrations: [
      // Default integrations minus Breadcrumbs' console capture: a
      // console.log carrying a lead's email would otherwise ride along
      // with the next error.
      Sentry.breadcrumbsIntegration({ console: false }),
    ],
  });
}
