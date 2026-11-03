/**
 * The /admin/analytics header's ranges: 24 h, 7, 28, 90 days.
 *
 * Its own plain module, not exported from AnalyticsHeaderControls: a
 * value exported from a "use client" file reaches a Server Component as a
 * client reference, not the array — `ANALYTICS_RANGES.includes` was "not a
 * function" and the whole page fell into its error boundary.
 */

export const ANALYTICS_RANGES = ["1", "7", "28", "90"] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];
