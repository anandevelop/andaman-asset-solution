/**
 * instrumentation.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Next.js runs `register()` once per server runtime, before any request is
 * handled. Two things depend on it:
 *
 *   1. Sentry. From @sentry/nextjs v8 onward the SDK is NOT initialised by
 *      the presence of sentry.server.config.ts alone — that file has to be
 *      imported from here, or the Node and Edge runtimes report nothing
 *      and the config files sit on disk doing exactly nothing. Only the
 *      browser SDK works without this hook.
 *
 *   2. Environment validation — see lib/env.ts. Checked here so a
 *      misconfigured container fails to start rather than starting and
 *      serving something subtly wrong.
 *
 * Next 15 runs this hook unconditionally. Next 14 gated it behind
 * `experimental.instrumentationHook`, which no longer exists.
 *
 * The dynamic imports are required: sentry.edge.config.ts must never be
 * pulled into the Node bundle, or vice versa.
 * ─────────────────────────────────────────────────────────────────────────
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Node-only: the Edge runtime has no process.exit and a different set
    // of variables available.
    const { assertEnv } = await import("@/lib/env");

    try {
      assertEnv();
    } catch (error) {
      /*
        Exit rather than rethrow.

        Next catches anything register() throws, logs "Failed to prepare
        server", and then carries on listening — answering every request,
        including /api/health, with a 500. The container stays up and
        `restart: always` never fires, so a one-line configuration mistake
        presents as a site that is merely broken. A non-zero exit is the
        signal an orchestrator actually acts on.
      */
      console.error(`\n${error instanceof Error ? error.message : error}\n`);
      process.exit(1);
    }

    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

/**
 * Server-side errors.
 *
 * Next calls this for anything thrown while rendering a server component,
 * a route handler or a server action. Those never pass through a client
 * error boundary, so this export is the only place they can be caught.
 *
 * Two things hear about it: the site's own error log, which tells the team
 * on LINE (lib/system-errors.ts), and Sentry — a no-op unless a DSN is set.
 * The log is Node-only (it writes to Postgres); the import is dynamic so
 * the Edge bundle never pulls Prisma in.
 */
export const onRequestError: typeof Sentry.captureRequestError = async (error, request, context) => {
  Sentry.captureRequestError(error, request, context);

  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { recordSystemError } = await import("@/lib/system-errors");
      await recordSystemError(error, { kind: "server", path: context.routePath || request.path });
    } catch (failure) {
      console.error("[instrumentation] could not record the error", failure);
    }
  }
};
