"use server";

/**
 * The speed tab's buttons: test one page now, scan the preset pages, and
 * the scan's progress for the button to poll. ADMIN and above. The brakes
 * (cache, cooldown, two at a time, daily cap) live in lib/pagespeed/run.ts,
 * so no caller can skip them.
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { getScanState, runPageSpeed, runScan, scanBlocked, type ScanState } from "@/lib/pagespeed/run";
import { getPsiConfig } from "@/lib/pagespeed/config";
import type { Strategy } from "@/lib/pagespeed/parse";

const PATH = /^\/(?:en|th|zh|ru)(?:\/[A-Za-z0-9\-._~%/]*)?$/;

async function allowed(): Promise<boolean> {
  try {
    await requireAdminAction(Role.ADMIN);
    return true;
  } catch {
    return false;
  }
}

export type TestPageResult =
  | { ok: true; cached: boolean; performance: number | null }
  | { ok: false; error: string; detail?: string };

export async function testPageAction(
  locale: string,
  path: string,
  strategy: Strategy,
  force: boolean,
): Promise<TestPageResult> {
  if (!(await allowed())) return { ok: false, error: "FORBIDDEN" };
  const clean = path.replace(/\/+$/, "");
  if (!PATH.test(clean) || /^\/[a-z]{2}\/(?:admin|api)(?:\/|$)/.test(clean) || clean.includes("..")) {
    return { ok: false, error: "BAD_URL" };
  }
  if (strategy !== "mobile" && strategy !== "desktop") return { ok: false, error: "BAD_URL" };

  const outcome = await runPageSpeed({ path: clean, strategy, source: "manual", force, hl: locale === "en" ? "en" : "th" });
  revalidatePath(`/${locale}/admin/seo/speed`);
  if (!outcome.ok) return { ok: false, error: outcome.error, detail: outcome.detail };
  return { ok: true, cached: outcome.cached, performance: outcome.run.performance };
}

export type StartScanResult = { ok: true; state: ScanState | null } | { ok: false; error: string; until?: string };

export async function startScanAction(): Promise<StartScanResult> {
  if (!(await allowed())) return { ok: false, error: "FORBIDDEN" };
  if (!(await getPsiConfig()).apiKey) return { ok: false, error: "NO_KEY" };
  const blocked = scanBlocked(await getScanState(), "manual");
  if (blocked) return { ok: false, error: blocked.reason, until: blocked.until };

  after(async () => {
    try {
      await runScan("manual");
    } catch (error) {
      console.error("[pagespeed] manual scan failed", error);
    }
  });
  return { ok: true, state: null };
}

export async function scanStateAction(): Promise<ScanState | null> {
  if (!(await allowed())) return null;
  return getScanState();
}
