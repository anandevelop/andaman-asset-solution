"use server";

/**
 * The SEO hub header's "สแกนเว็บ": run the on-page audit now instead of
 * waiting for 03:15. It fetches every public URL, which takes longer than
 * the proxy will hold a request open, so it runs after the response
 * (next/server after()) and the header says it has started. One at a time
 * per process.
 */

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireAdminAction } from "@/lib/admin/guard";
import { runSeoAudit } from "@/lib/seo/run-audit";

let running = false;

export async function startSeoScan(locale: string): Promise<{ ok: true } | { ok: false; error: "RUNNING" | "FORBIDDEN" }> {
  try {
    await requireAdminAction(Role.ADMIN);
  } catch {
    return { ok: false, error: "FORBIDDEN" };
  }
  if (running) return { ok: false, error: "RUNNING" };
  running = true;

  after(async () => {
    try {
      // Its own server, not the public URL: no CDN, no TLS hop, no proxy limits.
      await runSeoAudit({ baseUrl: `http://127.0.0.1:${process.env.PORT ?? 3000}` });
      revalidatePath(`/${locale}/admin/seo`, "layout");
    } catch (error) {
      console.error("[seo-scan] failed", error);
    } finally {
      running = false;
    }
  });

  return { ok: true };
}
