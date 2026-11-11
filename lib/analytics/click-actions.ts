/**
 * lib/analytics/click-actions.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Which clicks count as "somebody tried to get in touch", and how a link
 * is recognised as one.
 *
 * Recognised from the link itself (tel:, LINE, WhatsApp…) so no button
 * anywhere on the site has to be wired up by hand, and a contact link
 * added next month is counted the day it ships. A link can still name its
 * action explicitly with data-track="brochure" (or any key below).
 *
 * The two form submissions — the enquiry and the event RSVP — are not
 * links; LeadForm and EventRsvpForm report those through lib/analytics.ts.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const CLICK_ACTIONS = [
  "phone",
  "line",
  "whatsapp",
  "messenger",
  "wechat",
  "email",
  "map",
  "brochure",
  "lead_submit",
  "event_rsvp",
] as const;

export type ClickAction = (typeof CLICK_ACTIONS)[number];

export function isClickAction(value: unknown): value is ClickAction {
  return typeof value === "string" && (CLICK_ACTIONS as readonly string[]).includes(value);
}

/** The action a link's href stands for, or null for an ordinary link. */
export function actionForHref(href: string | null | undefined): ClickAction | null {
  if (!href) return null;
  const value = href.trim().toLowerCase();

  if (value.startsWith("tel:")) return "phone";
  if (value.startsWith("mailto:")) return "email";
  if (value.startsWith("line://")) return "line";
  if (value.startsWith("whatsapp:")) return "whatsapp";
  if (value.startsWith("weixin:")) return "wechat";

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const is = (domain: string) => host === domain || host.endsWith(`.${domain}`);

  if (is("line.me") || is("lin.ee")) return "line";
  if (is("wa.me") || is("whatsapp.com")) return "whatsapp";
  if (is("m.me") || is("messenger.com")) return "messenger";
  if (is("maps.app.goo.gl") || (is("goo.gl") && url.pathname.startsWith("/maps"))) return "map";
  if (/(^|\.)google\.[a-z.]+$/.test(host) && url.pathname.startsWith("/maps")) return "map";
  if (is("maps.google.com") || is("maps.apple.com")) return "map";
  // A brochure or price list as a PDF, wherever it is hosted.
  if (url.pathname.endsWith(".pdf")) return "brochure";
  return null;
}
