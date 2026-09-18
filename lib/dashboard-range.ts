/**
 * lib/dashboard-range.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The dashboard's date-range values, shared by the server page (which
 * parses `?range=` and scopes its queries) and the client control that
 * changes it (components/admin/DashboardControls.tsx).
 *
 * These live here, in a plain module, rather than beside the control:
 * every named export of a "use client" file becomes a client reference
 * when a Server Component imports it, so calling isRangeDays() from the
 * page would fail at runtime ("attempted to call ... from the server").
 * A shared helper that both sides need is not client code.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const RANGE_OPTIONS = ["7", "30", "90", "365"] as const;

export type RangeDays = (typeof RANGE_OPTIONS)[number];

export function isRangeDays(value: string | undefined): value is RangeDays {
  return !!value && (RANGE_OPTIONS as readonly string[]).includes(value);
}
