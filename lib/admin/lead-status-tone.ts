/**
 * lib/admin/lead-status-tone.ts
 * ─────────────────────────────────────────────────────────────────────────
 * One colour per pipeline stage, for the status pill, its menu, the board's
 * column dots and the dashboard funnel — so NEW is the same colour on every
 * screen that shows it. The label always travels with the colour; nothing
 * relies on hue alone to tell two stages apart.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { LeadStatus } from "@prisma/client";

/** Pill: background and text, from the status token pairs (≥5.7:1). */
export const LEAD_STATUS_PILL: Record<LeadStatus, string> = {
  NEW: "bg-adm-status-info-bg text-adm-status-info",
  CONTACTED: "bg-adm-neutral-bg text-adm-neutral",
  QUALIFIED: "bg-adm-status-info-bg text-adm-status-info",
  VIEWING_SCHEDULED: "bg-adm-warning-bg text-adm-warning",
  NEGOTIATING: "bg-adm-warning-bg text-adm-warning",
  WON: "bg-adm-success-bg text-adm-success",
  LOST: "bg-adm-danger-bg text-adm-danger",
};

/** A dot, where only a mark fits: board column heads, menu rows. */
export const LEAD_STATUS_DOT: Record<LeadStatus, string> = {
  NEW: "bg-adm-status-info",
  CONTACTED: "bg-adm-neutral",
  QUALIFIED: "bg-adm-info",
  VIEWING_SCHEDULED: "bg-adm-fill",
  NEGOTIATING: "bg-adm-warning",
  WON: "bg-adm-success",
  LOST: "bg-adm-danger",
};

/** The dot's hue as `color`, for what is drawn in currentColor — the
 *  dashboard funnel's glow is a box-shadow in the bar's own colour. */
export const LEAD_STATUS_TEXT: Record<LeadStatus, string> = {
  NEW: "text-adm-status-info",
  CONTACTED: "text-adm-neutral",
  QUALIFIED: "text-adm-info",
  VIEWING_SCHEDULED: "text-adm-fill",
  NEGOTIATING: "text-adm-warning",
  WON: "text-adm-success",
  LOST: "text-adm-danger",
};
