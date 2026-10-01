/**
 * lib/dashboard-queue.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The response SLA, shared by everything that calls a lead "overdue".
 *
 * This file used to hold the dashboard's work-queue queries as well. The
 * v4 dashboard reads through lib/admin/dashboard.ts instead, and what is
 * left is the one number the leads board, the dashboard's age badges and
 * the brief's "oldest waiting" tile all have to agree on.
 * ─────────────────────────────────────────────────────────────────────────
 */

/** Hours a NEW lead can sit untouched before it counts as overdue. */
export const RESPONSE_SLA_HOURS = 24;
