/**
 * lib/site-copy-content.ts
 * ─────────────────────────────────────────────────────────────────────────
 * The editable text of the code-owned long-form pages, per locale, as the
 * trees /admin/pages/copy lists and lib/site-copy.ts overrides — see
 * CONTENT_NAMESPACES in lib/site-copy-core.ts.
 *
 * Text only. A policy's `version` and `effectiveDate` stay in code because
 * they are not wording: the version is what a lead's PDPA consent is
 * recorded against (siteConfig.legal.consentVersion), and a substantive
 * change to the policy is a reason to bump it — a decision for a pull
 * request, not a text box. `contactPhone` is the legal line from
 * config/site.ts. Leaving them out of the tree is what keeps them out of
 * the editor and out of reach of the save action, which only accepts keys
 * that appear here.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getAchievementsContent } from "@/content/achievements";
import { getPrivacyPolicy } from "@/content/privacy-policy";
import { getTermsOfService } from "@/content/terms";
import { EDITABLE_NAMESPACES, flattenMessages, type ContentNamespace } from "@/lib/site-copy-core";

function legalText<T extends { version: string; effectiveDate: string; contactPhone: unknown }>(
  doc: T,
): Omit<T, "version" | "effectiveDate" | "contactPhone"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- picked out to drop them
  const { version, effectiveDate, contactPhone, ...text } = doc;
  return text;
}

export function contentCopyDefaults(locale: string): Record<ContentNamespace, unknown> {
  return {
    achievementsPage: getAchievementsContent(locale),
    privacyPolicy: legalText(getPrivacyPolicy(locale)),
    terms: legalText(getTermsOfService(locale)),
  };
}

/**
 * Every editable string in one language, flat — `{ "home.corporate.title":
 * "…", "privacyPolicy.sections.0.heading": "…" }`. The editor lists these
 * and the save action accepts only these keys.
 *
 * Read from the JSON as committed, not through next-intl, which would hand
 * back the overrides: this is the built-in copy a blank field falls back to.
 */
export async function allCopyDefaults(locale: string): Promise<Record<string, string>> {
  const messages = (await import(`@/messages/${locale}.json`)).default as Record<string, unknown>;
  return flattenMessages({
    ...Object.fromEntries(EDITABLE_NAMESPACES.map((name) => [name, messages[name]])),
    ...contentCopyDefaults(locale),
  });
}
