/**
 * app/api/cron/rebuild-blueprints/route.ts
 * ─────────────────────────────────────────────────────────────────────────
 * POST /api/cron/rebuild-blueprints — derive every floor plan's blueprint
 * again from the line drawing it already has.
 *
 * WHY THIS EXISTS
 *
 * A blueprint is only derived when a floor's drawing changes (see
 * saveUnitTypeFloors). When the transform itself is fixed — as it was for
 * PNGs with a transparent background, whose empty areas came out as solid
 * pale-blue blocks — every blueprint already in the bucket keeps the old
 * defect until somebody re-uploads each drawing by hand. This does all of
 * them at once.
 *
 * Not on the cron schedule. Run it after deploying a change to
 * lib/floor-plan-images.ts:
 *
 *   docker compose -f docker-compose.prod.yml exec app node scripts/rebuild-blueprints.mjs
 *
 * Guarded like the scheduled jobs (CRON_SECRET), because it is the same
 * kind of thing: an operator's command, not something a page calls.
 *
 * WHAT IT DOES TO EACH FLOOR
 *
 *   · writes the new blueprint under a fresh, versioned key (see
 *     blueprintKeyFor), so neither the CDN nor the image optimizer can
 *     keep serving the old one;
 *   · points blueprintImageUrl at it and refreshes the stored size;
 *   · deletes the previous blueprint object, best effort.
 *
 * Floors whose drawing is a static file under public/ (the seed kit) have
 * nowhere to write a blueprint and are skipped — their blueprints ship in
 * the repo. A floor that fails is reported and left exactly as it was.
 *
 * ?dryRun=1 lists what would be rebuilt without touching anything.
 * ?project=<slug> limits the run to one project.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { NextResponse } from "next/server";
import { guardCron } from "@/lib/seo/cron-auth";
import { prisma } from "@/lib/prisma";
import { deriveBlueprint } from "@/lib/floor-plan-images";
import { deleteS3Object, isS3Configured, objectKeyFromUrl } from "@/lib/s3";
import { revalidatePublicSite } from "@/lib/revalidate-site";
import { reportError } from "@/lib/sentry";

/** Seconds. Each floor is a download, a decode and an upload — about a
 *  second apiece — and they run one at a time to keep memory flat. */
export const maxDuration = 300;

export const dynamic = "force-dynamic";

type FloorResult = {
  id: string;
  project: string;
  unitType: string;
  floor: string;
  status: "rebuilt" | "skipped" | "failed" | "would-rebuild";
  reason?: string;
};

export async function POST(request: Request) {
  const denied = guardCron(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const dryRun = params.get("dryRun") === "1";
  const projectSlug = params.get("project")?.trim() || undefined;

  if (!dryRun && !isS3Configured()) {
    return NextResponse.json({ ok: false, error: "S3_NOT_CONFIGURED" }, { status: 500 });
  }

  const floors = await prisma.floorPlan.findMany({
    where: projectSlug ? { unitType: { project: { slug: projectSlug } } } : undefined,
    select: {
      id: true,
      floorName: true,
      imageUrl: true,
      blueprintImageUrl: true,
      unitType: { select: { name: true, project: { select: { slug: true } } } },
    },
    orderBy: [{ unitTypeId: "asc" }, { sortOrder: "asc" }],
  });

  // One version for the whole run: every blueprint it writes shares it,
  // which makes "which run wrote this file" readable from the bucket.
  const version = Date.now().toString(36);
  const results: FloorResult[] = [];

  for (const floor of floors) {
    const base = {
      id: floor.id,
      project: floor.unitType.project.slug,
      unitType: floor.unitType.name,
      floor: floor.floorName,
    };

    const lineKey = objectKeyFromUrl(floor.imageUrl);
    if (!lineKey) {
      results.push({ ...base, status: "skipped", reason: "static file, not in the bucket" });
      continue;
    }

    if (dryRun) {
      results.push({ ...base, status: "would-rebuild" });
      continue;
    }

    try {
      const derived = await deriveBlueprint(floor.imageUrl, { version });
      if (!derived.blueprintUrl) {
        // deriveBlueprint reports its own upload failures; keep the old
        // blueprint rather than replacing it with nothing.
        results.push({ ...base, status: "failed", reason: "upload failed — previous blueprint kept" });
        continue;
      }

      await prisma.floorPlan.update({
        where: { id: floor.id },
        data: {
          blueprintImageUrl: derived.blueprintUrl,
          imageWidth: derived.width,
          imageHeight: derived.height,
        },
      });

      const oldKey = floor.blueprintImageUrl ? objectKeyFromUrl(floor.blueprintImageUrl) : null;
      const newKey = objectKeyFromUrl(derived.blueprintUrl);
      if (oldKey && oldKey !== newKey) {
        await deleteS3Object(oldKey).catch((error) => {
          console.warn("[cron/rebuild-blueprints] old blueprint not deleted", oldKey, error);
        });
      }

      results.push({ ...base, status: "rebuilt" });
    } catch (error) {
      reportError(error, {
        tags: { scope: "rebuildBlueprints" },
        extra: { floorPlanId: floor.id, imageUrl: floor.imageUrl },
      });
      results.push({
        ...base,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (!dryRun && results.some((result) => result.status === "rebuilt")) {
    revalidatePublicSite();
  }

  const count = (status: FloorResult["status"]) => results.filter((result) => result.status === status).length;

  return NextResponse.json({
    ok: count("failed") === 0,
    dryRun,
    version: dryRun ? null : version,
    total: results.length,
    rebuilt: count("rebuilt"),
    wouldRebuild: count("would-rebuild"),
    skipped: count("skipped"),
    failed: count("failed"),
    floors: results,
  });
}
