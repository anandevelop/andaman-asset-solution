/**
 * lib/analytics/origin-schema.ts
 * The wire shape of a visit's origin, checked on the two public endpoints
 * that receive it (app/api/page-view, app/api/click). Bounded strings, so
 * a forged body can only ever produce a short, odd source name.
 */

import { z } from "zod";

const short = z.string().trim().max(120).optional().default("");

export const visitOriginSchema = z.object({
  referrer: short,
  utmSource: short,
  utmMedium: short,
  gclid: z.boolean().optional().default(false),
  fbclid: z.boolean().optional().default(false),
});
