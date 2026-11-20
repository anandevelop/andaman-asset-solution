/**
 * lib/mcp/tools/system.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The system area, read-only by decision: an AI client may look at the
 * health of the site and its error log and may change neither. Settings,
 * users and keys are not offered at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { z } from "zod";
import { defineTool } from "@/lib/mcp/registry";
import { getSystemHealth } from "@/lib/admin/system-health";
import { recentSystemErrors } from "@/lib/system-errors";

defineTool({
  name: "system_status",
  title: "System status",
  description:
    "Health of the website's services as the back office's System page shows it: one row per service with state \"ok\", \"attention\" or \"off\", plus storage used. Read-only.",
  access: "read",
  input: {},
  handler: async () => {
    const health = await getSystemHealth();
    return {
      databaseOffline: health.databaseOffline,
      storageBytes: health.storageBytes,
      services: health.rows.map(({ key, state, detailKey, detailValues }) => ({ service: key, state, detail: detailKey, values: detailValues ?? {} })),
    };
  },
});

defineTool({
  name: "system_errors",
  title: "Recent system errors",
  description:
    "The site's own error log, most recent first: error name and message, where it happened (route, no query string), how many times, first and last seen. Contains no visitor data. Read-only; the log cannot be cleared from here.",
  access: "read",
  input: { limit: z.number().int().min(1).max(50).optional().describe("How many to return (default 20)") },
  handler: async ({ limit }) => ({ errors: await recentSystemErrors(limit ?? 20) }),
});
