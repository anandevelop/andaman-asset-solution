"use client";

/**
 * components/CookieConsentBanner.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * PDPA cookie banner — opt-in, not opt-out. Nothing beyond
 * strictly-necessary cookies runs until a visitor decides (see
 * lib/cookie-consent.ts and components/Analytics.tsx, which is the thing
 * this banner actually gates).
 *
 * Three states:
 *   1. First visit, no stored decision → banner opens itself.
 *   2. Returning visitor with a decision → renders nothing.
 *   3. Footer's "Cookie Preferences" link dispatches CONSENT_OPEN_EVENT →
 *      reopens in the customise panel, pre-filled with the existing choice,
 *      so changing your mind later is one click away, not a support ticket.
 *
 * Fixed to the bottom rather than a full-screen modal — the FAQ page and
 * the project brochure are still reachable underneath it, and a visitor
 * who ignores it entirely has not been blocked from anything necessary.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Cookie } from "lucide-react";
import {
  CONSENT_OPEN_EVENT,
  useCookieConsent,
  writeConsent,
  type ConsentDecision,
} from "@/lib/cookie-consent";

const ALL_ACCEPTED: ConsentDecision = { analytics: true, marketing: true };
const ALL_REJECTED: ConsentDecision = { analytics: false, marketing: false };

// Bespoke rather than reused from .btn-primary/.btn-outline (public CTAs,
// too large for a row of three inline buttons) or .admin-btn/.admin-btn-ghost
// (the back-office's denser rhythm, not this component's home) — same
// palette and rounded-sm corners as both, sized for a banner.
const PRIMARY_BTN =
  "inline-flex items-center justify-center rounded-sm bg-primary px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-white transition-colors hover:bg-primary-700 sm:text-sm";
const GHOST_BTN =
  "inline-flex items-center justify-center rounded-sm border border-primary/20 px-5 py-2.5 text-xs font-medium uppercase tracking-wide text-primary transition-colors hover:border-primary hover:bg-primary/5 sm:text-sm";

export default function CookieConsentBanner() {
  const t = useTranslations("cookieConsent");
  const locale = useLocale();
  const { consent, ready } = useCookieConsent();

  const [open, setOpen] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [draft, setDraft] = useState<ConsentDecision>(ALL_REJECTED);

  // First-time visitor: no decision on record yet.
  useEffect(() => {
    if (ready && consent === null) setOpen(true);
  }, [ready, consent]);

  // "Cookie Preferences" in the footer — reopen even if already decided,
  // straight into the customise view with the current choice pre-filled.
  useEffect(() => {
    const onOpen = () => {
      setDraft(consent ?? ALL_REJECTED);
      setCustomizing(true);
      setOpen(true);
    };

    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
  }, [consent]);

  if (!open) return null;

  const decide = (decision: ConsentDecision) => {
    writeConsent(decision);
    setOpen(false);
    setCustomizing(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t("necessaryTitle")}
      // Solid, not translucent: bg-white/97 + backdrop-blur read as a hazy
      // strip with the page bleeding through behind it, which is what made
      // this hard to read. A fully opaque background plus a visible border
      // and stronger shadow reads as a distinct panel instead.
      className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-primary/20 bg-white p-4 shadow-[0_-8px_30px_rgba(0,0,0,0.18)] sm:p-6"
    >
      <div className="container-luxe">
        {!customizing ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-3 text-sm leading-relaxed text-ink/80 sm:items-center">
              <Cookie size={20} className="mt-0.5 shrink-0 text-accent-700 sm:mt-0" aria-hidden />
              <span>
                {t("message")}{" "}
                <Link
                  href={`/${locale}/privacy-policy`}
                  className="font-medium text-primary underline decoration-accent/40 underline-offset-4 hover:decoration-accent"
                >
                  {t("privacyPolicyLink")}
                </Link>
                .
              </span>
            </p>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDraft(consent ?? ALL_REJECTED);
                  setCustomizing(true);
                }}
                className={GHOST_BTN}
              >
                {t("customize")}
              </button>
              <button
                type="button"
                onClick={() => decide(ALL_REJECTED)}
                className={GHOST_BTN}
              >
                {t("rejectAll")}
              </button>
              <button
                type="button"
                onClick={() => decide(ALL_ACCEPTED)}
                className={PRIMARY_BTN}
              >
                {t("acceptAll")}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="space-y-4">
              <ConsentRow
                title={t("necessaryTitle")}
                description={t("necessaryDescription")}
                checked
                locked
              />
              <ConsentRow
                title={t("analyticsTitle")}
                description={t("analyticsDescription")}
                checked={draft.analytics}
                onChange={(value) => setDraft((prev) => ({ ...prev, analytics: value }))}
              />
              <ConsentRow
                title={t("marketingTitle")}
                description={t("marketingDescription")}
                checked={draft.marketing}
                onChange={(value) => setDraft((prev) => ({ ...prev, marketing: value }))}
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-primary/10 pt-4">
              <button
                type="button"
                onClick={() => setCustomizing(false)}
                className={GHOST_BTN}
              >
                {t("back")}
              </button>
              <button
                type="button"
                onClick={() => decide(draft)}
                className={PRIMARY_BTN}
              >
                {t("save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

type ConsentRowProps = {
  title: string;
  description: string;
  checked: boolean;
  locked?: boolean;
  onChange?: (value: boolean) => void;
};

function ConsentRow({ title, description, checked, locked, onChange }: ConsentRowProps) {
  return (
    <label
      className={`flex items-start justify-between gap-4 ${locked ? "cursor-default" : "cursor-pointer"}`}
    >
      <span>
        <span className="block text-sm font-medium text-primary">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink/60">{description}</span>
      </span>

      <span className="mt-0.5 shrink-0">
        <input
          type="checkbox"
          checked={checked}
          disabled={locked}
          onChange={(event) => onChange?.(event.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden
          // The checkbox is visually hidden (sr-only) inside this same
          // <label> — a native <label> forwards clicks to its descendant
          // input without any manual wiring, disabled inputs included.
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            checked ? "bg-primary" : "bg-primary/15"
          } ${locked ? "opacity-60" : ""}`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              checked ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </span>
      </span>
    </label>
  );
}
