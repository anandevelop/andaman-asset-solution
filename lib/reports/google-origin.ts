/**
 * lib/reports/google-origin.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Which leads actually came from Google, and which page they landed on.
 *
 * THE MISTAKE THIS FILE EXISTS TO PREVENT
 *
 * The first version of the monthly report divided Google clicks by *every*
 * lead — LINE OA, referrals, walk-ins and all. "1,284 clicks, 11 leads,
 * 0.86%" is a number with no meaning: the numerator counts one channel and
 * the denominator counts all of them. A conversion rate is only a rate when
 * both halves are the same population.
 *
 * Nothing already on LeadInquiry could fix it:
 *
 *   - LeadSource is PROJECT_PAGE / CONTACT_PAGE / … / OTHER. None of those
 *     means "arrived from a search engine"; they describe which form was
 *     used.
 *   - sourcePath is the page the form was *submitted* from. Somebody who
 *     arrives from Google on an article and then enquires from /contact is
 *     recorded as /contact, and the article that earned the lead gets no
 *     credit.
 *   - utmSource/utmMedium only exist on tagged links, which is exactly what
 *     organic search results are not.
 *
 * So phase 3 added landingPath and landingReferrer, written from the first
 * page of the visit. This file is the rule that reads them, kept apart from
 * any query so it can be tested against the awkward cases directly.
 *
 * NOT BACKFILLABLE
 *
 * Leads that predate the deploy have no landing at all, and no amount of
 * later cleverness can invent one. Every report built on this must print
 * the date collection started — see reportCoverageStart — or it silently
 * reads as "we got no Google leads in July".
 * ─────────────────────────────────────────────────────────────────────────
 */

/** The parts of a lead this rule looks at. */
export type LeadOrigin = {
  landingReferrer: string | null;
  landingPath: string | null;
  utmMedium: string | null;
};

/*
  Google's search hosts, matched against the *host* landingReferrer stores.

  Anchored at both ends: a bare /google/ test would count
  "notgoogle.example.com" and — more likely to actually happen — any site
  that puts "google" in a subdomain to look legitimate.

  The country domains are open-ended because Google runs about 190 of them
  (google.co.th, google.com.au, google.de …) and a hand-written list would
  be wrong in whichever market the client expands into next.
*/
const GOOGLE_HOST = /^(?:[a-z0-9-]+\.)*google(?:\.[a-z]{2,3}){1,2}$/i;

/**
 * Was this visit a click from Google search?
 *
 * A tagged link is deliberately excluded even when the referrer is Google:
 * utm_medium=cpc on a google.com referrer is the paid ad, and counting ads
 * inside an organic-search figure is the same cross-base error in
 * miniature. An ad click and a search result cost very different things.
 */
export function isGoogleOrigin(lead: LeadOrigin): boolean {
  if (lead.utmMedium && lead.utmMedium.trim() !== "") return false;

  const host = normaliseHost(lead.landingReferrer);
  return host !== null && GOOGLE_HOST.test(host);
}

/**
 * The host, from whatever was stored.
 *
 * landingReferrer is written as a bare host by lib/analytics/landing.ts,
 * but a row written by an older client, a hand-edited record or a future
 * caller may hold a full URL. Parsing both costs one try/catch and removes
 * a class of silent undercounting — a full URL would simply never match
 * the pattern above and the lead would be filed as "not from Google".
 */
function normaliseHost(value: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim().toLowerCase();
  if (trimmed === "") return null;

  if (trimmed.includes("/")) {
    try {
      return new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`)
        .hostname;
    } catch {
      return null;
    }
  }

  // Strip a port if one came along ("google.co.th:443").
  return trimmed.split(":")[0];
}

/**
 * Which project a landing path belongs to, or null for the rest of the
 * site.
 *
 * Matched on the slug segment rather than by `startsWith` on the whole
 * path: /projects/victory-villas and /projects/victory are different
 * projects, and a prefix test credits the first lead of the second one to
 * whichever slug happens to be a prefix of the other.
 *
 * The path arrives locale-stripped (lib/public-paths.ts's stripLocale is
 * applied when it is written), so /th/projects/x and /projects/x are the
 * same row here.
 */
export function projectOfLandingPath(
  landingPath: string | null,
  slugToProjectId: ReadonlyMap<string, string>,
): string | null {
  if (!landingPath) return null;

  const segments = landingPath
    .split("?")[0]
    .split("#")[0]
    .split("/")
    .filter(Boolean);
  if (segments.length < 2 || segments[0] !== "projects") return null;

  return slugToProjectId.get(segments[1]) ?? null;
}

/**
 * The bucket a landing path counts towards on the report's table.
 *
 * Projects get a row each; news and articles share one, because "which
 * article earned it" is a question the content report answers and the
 * executive table is about developments. Everything else — the home page,
 * /contact, /about — is deliberately not a row: a lead that landed there
 * came from somewhere other than a project page, and inventing a row for
 * it would pad the table without telling anybody what to do next.
 */
export function landingBucket(
  landingPath: string | null,
  slugToProjectId: ReadonlyMap<string, string>,
): { kind: "project"; projectId: string } | { kind: "news" } | null {
  const projectId = projectOfLandingPath(landingPath, slugToProjectId);
  if (projectId) return { kind: "project", projectId };

  if (!landingPath) return null;

  const first = landingPath.split("?")[0].split("/").filter(Boolean)[0];
  return first === "news" ? { kind: "news" } : null;
}
