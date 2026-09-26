/**
 * app/api/cron/seo-inspect/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cron/seo-inspect — ask Google what it has done with each URL.
 *
 * The quota is the whole design: 2,000 inspections a day per property,
 * shared with anybody clicking "Test live URL" in Search Console itself.
 * lib/seo/url-inspection.ts picks the least-recently-inspected URLs and
 * leaves a reserve, so a site larger than the quota still converges on
 * everything being checked rather than re-checking the same head of the
 * list for ever.
 *
 * URLs are built from GSC_SITE_URL, never from the site's canonical
 * origin. Google answers 403 for any URL outside the registered property,
 * and on this deployment those two are different hosts — building them
 * from siteConfig would 403 on every single one, in a way indistinguishable
 * from a permissions problem.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardCron } from "@/lib/seo/cron-auth";
import { inspectionUrlFor, selectForInspection, sweepInspections } from "@/lib/seo/url-inspection";
import { recordCronFailure } from "@/lib/seo/alerts";

/** Seconds. Sequential by design — the quota is per property, so
 *  concurrency buys nothing but a faster way to hit the ceiling. */
export const maxDuration = 900;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  const siteUrl = process.env.GSC_SITE_URL?.trim();
  if (!siteUrl) return NextResponse.json({ ok: true, skipped: "GSC_SITE_URL not set" });

  try {
    const candidates = await prisma.seoUrlState.findMany({
      select: { url: true, inspectedAt: true },
    });

    const chosen = selectForInspection(candidates);
    const byPath = new Map(chosen.map((row) => [inspectionUrlFor(siteUrl, row.url), row.url]));

    const sweep = await sweepInspections(siteUrl, [...byPath.keys()]);

    for (const result of sweep.results) {
      const path = byPath.get(result.url);
      if (!path) continue;

      await prisma.seoUrlState.update({
        where: { url: path },
        data: {
          coverageState: result.coverageState,
          googleCanonical: result.googleCanonical,
          lastCrawledAt: result.lastCrawledAt,
          inspectedAt: new Date(),
        },
      });
    }

    if (sweep.stoppedOnQuota) {
      /*
        Recorded, but still a 200. Running out of quota is the system
        working as designed on a site larger than the daily allowance —
        tomorrow's run continues where this one stopped. A 500 would have
        the scheduler retry into a wall.
      */
      await recordCronFailure(
        "URL inspection (quota reached)",
        new Error(`stopped after ${sweep.inspected} URLs`),
      ).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      candidates: candidates.length,
      requested: chosen.length,
      inspected: sweep.inspected,
      failed: sweep.failed,
      stoppedOnQuota: sweep.stoppedOnQuota,
    });
  } catch (error) {
    console.error("[cron/seo-inspect] failed", error);
    await recordCronFailure("URL inspection", error).catch(() => {});

    return NextResponse.json({ ok: false, error: "INSPECT_FAILED" }, { status: 500 });
  }
}
