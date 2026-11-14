/**
 * lib/audit/origin.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Where an audited action came from: the client address and the browser.
 *
 * Read from the request headers, for both writers of the trail — the
 * Prisma extension (edits) and lib/audit/events.ts (sign-ins). Edits used
 * to carry neither, so "who changed this price" had a name and a time but
 * no way to tell the office from somewhere else.
 *
 * Null for both outside a request: a script or a scheduled job has no
 * address, and that is not an error. No `import "server-only"`, for the
 * reason given in lib/audit/extension.ts; next/headers is imported lazily
 * so this file stays loadable where there is no request at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { clientIp } from "@/lib/rate-limit";

export type RequestOrigin = { ipAddress: string | null; userAgent: string | null };

export async function requestOrigin(): Promise<RequestOrigin> {
  try {
    const { headers } = await import("next/headers");
    const list = await headers();
    const address = clientIp(list);
    const agent = list.get("user-agent")?.trim() ?? "";
    return {
      ipAddress: address === "unknown" ? null : address,
      userAgent: agent ? agent.slice(0, 300) : null,
    };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}
