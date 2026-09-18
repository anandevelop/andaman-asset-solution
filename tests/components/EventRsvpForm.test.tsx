/**
 * @vitest-environment jsdom
 *
 * Renders React, so it needs a DOM. Vitest 4 removed `environmentMatchGlobs`
 * from vitest.config.ts; the docblock is the replacement, and it has to be
 * the first thing in the file.
 */
/**
 * tests/components/EventRsvpForm.test.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The RSVP form is the events funnel's only conversion, and its consent
 * checkbox is a PDPA requirement — so the link that explains what is being
 * consented to has to work.
 *
 * It did not. The href was a bare `/privacy-policy` with no locale prefix,
 * which under `localePrefix: "always"` (middleware.ts) redirects to Thai,
 * in the same tab, discarding a half-filled form — react-hook-form keeps no
 * draft. components/LeadForm.tsx had it right; this component was written
 * later and did not copy it.
 *
 * Stubs are boundaries, not logic — the same three LeadForm.test.tsx uses,
 * minus fetch, since nothing here submits.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above the imports, so its factory cannot close over a
// normal const. vi.hoisted lifts the spy with it.
const { trackRsvp } = vi.hoisted(() => ({ trackRsvp: vi.fn() }));

vi.mock("@/lib/analytics", () => ({
  trackRsvp,
  trackLead: vi.fn(),
  trackEvent: vi.fn(),
  trackLineClick: vi.fn(),
  trackPageView: vi.fn(),
}));

// RecaptchaProvider renders next/script, which is noisy outside an app
// router render tree.
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => <script {...props} />,
}));

import EventRsvpForm from "@/components/EventRsvpForm";
import { render, screen } from "./render";

/*
  Both locales the render helper carries real messages for. The bug served
  Thai to everyone, so asserting only `en` would have caught it while
  asserting only `th` would not — the pair is the point.
*/
const CASES = [
  { locale: "en", label: /privacy policy/i, href: "/en/privacy-policy" },
  { locale: "th", label: /นโยบายความเป็นส่วนตัว/, href: "/th/privacy-policy" },
] as const;

describe("EventRsvpForm consent link", () => {
  it.each(CASES)("points at the $locale privacy policy", ({ locale, label, href }) => {
    render(<EventRsvpForm eventId="evt_1" seatsLeft={5} />, { locale });

    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  });

  it("opens in a new tab so a half-filled form is not lost", () => {
    render(<EventRsvpForm eventId="evt_1" seatsLeft={5} />);

    const link = screen.getByRole("link", { name: /privacy policy/i });
    expect(link).toHaveAttribute("target", "_blank");
    // noopener is the security half of target="_blank"; without it the
    // opened page gets a handle on window.opener.
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("still shows the consent checkbox the policy link belongs to", () => {
    // The link is only meaningful next to the control it explains. If the
    // checkbox ever disappears, the PDPA trail disappears with it.
    render(<EventRsvpForm eventId="evt_1" seatsLeft={5} />);

    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("hides the form, and the link, once the event is full", () => {
    // seatsLeft <= 0 returns the sold-out notice instead of the form.
    render(<EventRsvpForm eventId="evt_1" seatsLeft={0} />);

    expect(screen.queryByRole("link", { name: /privacy policy/i })).toBeNull();
    expect(screen.getByText(/fully booked/i)).toBeInTheDocument();
  });
});
