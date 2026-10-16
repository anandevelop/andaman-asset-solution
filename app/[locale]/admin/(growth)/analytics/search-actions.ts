"use server";

/**
 * app/[locale]/admin/(growth)/analytics/search-actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * What the Google Search panel asks for each time its range, search type,
 * tab or filters change. The first answer is rendered with the page; this
 * is every answer after it.
 *
 * Guarded here for the reason live-actions.ts gives: the (growth) layout
 * requires ADMIN, but a server action can be called directly by anybody who
 * knows its id, without any layout having rendered.
 *
 * The input is parsed rather than trusted. It comes from the browser, and
 * the filters are passed on to Google as expressions.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { Role } from "@prisma/client";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin/guard";
import { loadSearchPerformance, type SearchPerformance } from "@/lib/seo/search-performance";
import { BREAKDOWNS, RANGES, SEARCH_TYPES } from "@/lib/seo/search-performance-shape";
import { locales } from "@/i18n";

const text = z.string().trim().max(200).optional();

const Input = z.object({
  locale: z.enum(locales),
  range: z.enum(RANGES),
  type: z.enum(SEARCH_TYPES),
  breakdown: z.enum(BREAKDOWNS),
  filters: z.object({
    query: text,
    page: text,
    country: z.string().trim().regex(/^[a-z]{3}$/i).optional(),
    device: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional(),
  }),
});

export type SearchPerformanceInput = z.input<typeof Input>;

export async function fetchSearchPerformance(input: SearchPerformanceInput): Promise<SearchPerformance> {
  await requireAdminAction(Role.ADMIN);

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "FAILED", detail: "invalid request" };

  const { locale, ...params } = parsed.data;
  return loadSearchPerformance(params, locale);
}
