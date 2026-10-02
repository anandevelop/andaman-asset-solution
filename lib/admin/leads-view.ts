/**
 * lib/admin/leads-view.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Which view the leads page opens in: the `view` parameter when there is
 * one, else the last choice (a cookie LeadViewToggle writes), else the
 * table. Pure, so the precedence is tested without a request.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type LeadsView = "table" | "board";

export const LEADS_VIEW_COOKIE = "admin-leads-view";

function asView(value: string | undefined): LeadsView | null {
  return value === "table" || value === "board" ? value : null;
}

export function resolveLeadsView(param: string | undefined, cookie: string | undefined): LeadsView {
  return asView(param) ?? asView(cookie) ?? "table";
}
