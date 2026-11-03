/**
 * lib/google-check.ts
 * ─────────────────────────────────────────────────────────────────────────
 * "ทดสอบการเชื่อมต่อ Google": one step at a time, each answered in words an
 * admin can act on — the key is broken, the property is not shared with
 * the service account, the Analytics Data API is not switched on.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { SCOPES, tokenFor, type GoogleCredentials } from "@/lib/seo/google-client";

export type CheckStep = { ok: boolean; skipped?: boolean; detail?: string };
export type GoogleCheck = { token: CheckStep; searchConsole: CheckStep; analytics: CheckStep };

async function get(url: string, token: string): Promise<{ status: number; body: Record<string, any> | null }> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: response.status, body: (await response.json().catch(() => null)) as Record<string, any> | null };
}

function explain(status: number, body: Record<string, any> | null): string {
  const message: string = body?.error?.message ?? `HTTP ${status}`;
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(message)) return `API_DISABLED: ${message}`;
  if (status === 403) return `NO_ACCESS: ${message}`;
  if (status === 404) return `NOT_FOUND: ${message}`;
  return message;
}

export async function checkGoogleConnection(input: {
  credentials: GoogleCredentials | null;
  gscSiteUrl: string | null;
  ga4PropertyId: string | null;
}): Promise<GoogleCheck> {
  const skipped = { ok: false, skipped: true } as const;
  if (!input.credentials) return { token: { ok: false, detail: "NO_CREDENTIALS" }, searchConsole: skipped, analytics: skipped };

  const gscToken = await tokenFor(input.credentials, SCOPES.searchConsole);
  if (!gscToken.ok) return { token: { ok: false, detail: gscToken.error }, searchConsole: skipped, analytics: skipped };

  let searchConsole: CheckStep = skipped;
  if (input.gscSiteUrl) {
    try {
      const { status, body } = await get(
        `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(input.gscSiteUrl)}`,
        gscToken.token,
      );
      searchConsole = status === 200 ? { ok: true, detail: body?.permissionLevel } : { ok: false, detail: explain(status, body) };
    } catch (error) {
      searchConsole = { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  let analytics: CheckStep = skipped;
  if (input.ga4PropertyId) {
    const gaToken = await tokenFor(input.credentials, SCOPES.analytics);
    if (!gaToken.ok) analytics = { ok: false, detail: gaToken.error };
    else {
      try {
        const { status, body } = await get(
          `https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(input.ga4PropertyId)}/metadata`,
          gaToken.token,
        );
        analytics = status === 200 ? { ok: true } : { ok: false, detail: explain(status, body) };
      } catch (error) {
        analytics = { ok: false, detail: error instanceof Error ? error.message : String(error) };
      }
    }
  }

  return { token: { ok: true }, searchConsole, analytics };
}
