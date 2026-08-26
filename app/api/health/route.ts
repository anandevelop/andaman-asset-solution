/**
 * app/api/health/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * GET /api/health — liveness and readiness for load balancers and Docker.
 *
 * The status code is the only part an orchestrator reads, so it carries the
 * real meaning: 200 = route traffic here, 503 = do not. The JSON body is
 * for a human debugging at 2am.
 *
 * The database probe is `SELECT 1`, not a Prisma model query — it tests the
 * connection and nothing else, so it keeps working during a migration when
 * a table might legitimately be missing.
 *
 * Integration status is reported but never affects the status code. S3
 * being unreachable breaks admin uploads; it does not stop the site
 * serving pages, and pulling a container out of rotation for it would turn
 * a degraded back-office into a full outage.
 *
 * `?deep=1` additionally probes S3 with a HeadBucket call. Off by default
 * because a load balancer hitting this every ten seconds should not make
 * an AWS API call each time.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkS3Reachable, isS3Configured } from "@/lib/s3";
import { isLineConfigured } from "@/lib/line";
import { isRecaptchaConfigured } from "@/lib/recaptcha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Beyond this the database is unusable regardless of what it eventually
 *  answers, and the probe itself must not hang the health check. */
const DB_TIMEOUT_MS = 3_000;

type Check = { ok: boolean; latencyMs?: number; error?: string };

async function checkDatabase(): Promise<Check> {
  const startedAt = Date.now();

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), DB_TIMEOUT_MS),
      ),
    ]);

    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      // Message only — a driver stack trace can contain the connection
      // string, and this endpoint is typically unauthenticated.
      error: error instanceof Error ? error.message.split("\n")[0] : "unknown",
    };
  }
}

export async function GET(request: Request) {
  const deep = new URL(request.url).searchParams.get("deep") === "1";

  // Run the probes concurrently — a deep check should not cost the sum of
  // both timeouts.
  const [database, s3] = await Promise.all([
    checkDatabase(),
    deep ? checkS3Reachable() : Promise.resolve(null),
  ]);

  // Only the database gates readiness. Everything else is informational.
  const healthy = database.ok;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      version: process.env.npm_package_version ?? null,
      commit: process.env.GIT_COMMIT_SHA ?? null,
      checks: {
        database,
        s3: {
          configured: isS3Configured(),
          // Present only on a deep check, so a shallow response cannot be
          // misread as "S3 verified".
          ...(s3
            ? {
                reachable: s3.ok,
                ...(s3.ok
                  ? { latencyMs: s3.latencyMs }
                  : { reason: s3.reason, detail: s3.detail }),
              }
            : {}),
        },
        // Configuration only: probing LINE would post a message, and
        // reCAPTCHA has no health endpoint worth calling.
        line: { configured: isLineConfigured() },
        recaptcha: { configured: isRecaptchaConfigured() },
      },
    },
    {
      status: healthy ? 200 : 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        // A health check must never be answered by a CDN.
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

/** HEAD is what most load balancers actually send. */
export async function HEAD() {
  const database = await checkDatabase();
  return new Response(null, { status: database.ok ? 200 : 503 });
}
