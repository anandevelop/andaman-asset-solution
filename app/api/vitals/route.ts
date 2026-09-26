/**
 * app/api/vitals/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/vitals — "this is what the page felt like on my phone."
 *
 * Field data from real visits, which is the version Google ranks on and
 * the version worth fixing. PageSpeed Insights measures a datacentre; this
 * measures a customer in Phuket on hotel wifi.
 *
 * WHAT IS STORED, AND WHAT IS NOT
 *
 * A metric, a number, a path, mobile-or-desktop, and the build's commit
 * sha. No identifier of any kind — not even the hashed visit id the live
 * counter uses, because nothing here needs to join two measurements
 * together. A row cannot be traced to a person because there is nothing in
 * it that points at one.
 *
 * The user agent is read for one bit — mobile or desktop — and then
 * discarded. That split is the entire point of field data: a site that is
 * fine on a laptop and poor on a phone averages out to "fine", and the
 * phone is where the customers are.
 *
 * CONSENT IS ENFORCED IN THE BROWSER, NOT HERE
 *
 * WebVitalsBeacon sends nothing without the analytics cookie. This handler
 * cannot verify that — there is no session and, deliberately, no
 * identifier to check one against — so it is stated plainly: the sample is
 * consenting traffic only, and the dashboard says what share that is
 * rather than implying the number covers everyone.
 *
 * NOT WRAPPED IN safeQuery. safeQuery degrades a public *read* to an empty
 * state; this is a write, and one that already fails quietly.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { VitalMetric } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isDatabaseOfflineError } from "@/lib/db";
import { rateLimit, clientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { isCountablePublicPath, stripLocale } from "@/lib/public-paths";
import { deviceOf, storedValue, type VitalKey } from "@/lib/analytics/vitals";

const METRICS = ["LCP", "INP", "CLS", "TTFB"] as const;

const bodySchema = z.object({
  reports: z
    .array(
      z.object({
        metric: z.enum(METRICS),
        // Finite and non-negative; the clamp that stops one absurd sample
        // moving a p75 lives in storedValue().
        value: z.number().finite().min(0),
        path: z.string().trim().min(1).max(500),
      }),
    )
    // Four metrics per page load, and a flush after late consent can carry
    // all of them at once. Ten is room to spare and still a bound.
    .min(1)
    .max(10),
  /** 40 hex characters, or absent for a build with no sha. */
  commitSha: z.string().trim().max(64).nullish(),
});

export async function POST(request: Request) {
  const ip = clientIp(request.headers);
  if (!rateLimit(`vitals:${ip}`, RATE_LIMITS.vitals).ok) {
    return new NextResponse(null, { status: 204 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    const result = bodySchema.safeParse(await request.json());
    if (!result.success) return new NextResponse(null, { status: 204 });
    parsed = result.data;
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const device = deviceOf(request.headers.get("user-agent") ?? "");

  const rows = parsed.reports
    .map((report) => ({
      metric: report.metric as VitalKey,
      path: stripLocale(report.path),
      value: report.value,
    }))
    // The same list /api/page-view counts by. Without it, one crawler
    // reporting on invented URLs gives every one of them its own row and
    // its own line on the dashboard.
    .filter((report) => isCountablePublicPath(report.path))
    .map((report) => ({
      metric: VitalMetric[report.metric],
      value: storedValue(report.metric, report.value),
      path: report.path,
      device,
      commitSha: parsed.commitSha?.slice(0, 64) || null,
    }));

  if (rows.length === 0) return new NextResponse(null, { status: 204 });

  try {
    // Awaited rather than fired and forgotten: an un-awaited write can be
    // cut off when the response returns.
    await prisma.webVital.createMany({ data: rows });
  } catch (error) {
    // A visitor must never see anything go wrong because a measurement
    // did.
    if (!isDatabaseOfflineError(error)) {
      console.error("[vitals] failed to record", error);
    }
  }

  return new NextResponse(null, { status: 204 });
}
