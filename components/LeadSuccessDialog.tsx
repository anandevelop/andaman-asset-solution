"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { siteConfig } from "@/config/site";
import { trackWhatsappClick } from "@/lib/analytics";

/**
 * components/LeadSuccessDialog.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * The confirmation shown after LeadForm.tsx's submission succeeds — the
 * "Seal" design. Only the success state gets this treatment; error,
 * rateLimited and blocked keep LeadForm's existing inline live region,
 * since those need the visitor to see the form again to retry, not a
 * modal in front of it.
 *
 * PORTALED TO document.body, NOT RENDERED IN PLACE
 *
 * Every page that mounts <LeadForm> wraps it in a <Reveal>
 * (components/Reveal.tsx's own motion.div) for the scroll-in fade. Once
 * that animation settles, framer-motion can leave a non-default inline
 * `transform` on the element even at rest, and any CSS `transform` on an
 * ancestor makes it the containing block for a `position: fixed`
 * descendant — the fixed backdrop below would then cover that ancestor's
 * box instead of the viewport. createPortal sidesteps the question
 * entirely rather than depending on framer-motion's cleanup behaviour.
 *
 * FOCUS TRAP, BODY SCROLL LOCK
 *
 * Both copied from components/Navbar.tsx's mobile menu — the one other
 * full-screen overlay in this codebase with real Tab-cycling rather than
 * just Escape-to-close. Returning focus to whatever should be focused
 * after close (LeadForm's submit button) is the caller's job, the same
 * way Navbar's own `close()` refocuses its toggle button — this
 * component only knows how to trap focus while open, not where it came
 * from.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

function WhatsAppGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className="shrink-0" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

const BUTTON =
  "rounded-xs px-[22px] py-[13px] text-[11.5px] font-medium uppercase tracking-[0.14em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600";

export default function LeadSuccessDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("leadForm.successDialog");
  const tChat = useTranslations("chatButtons");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(false);

  // createPortal needs `document`, which does not exist during SSR — the
  // same reason every other portal-based React pattern gates on a mount
  // effect rather than rendering the portal on the first pass.
  useEffect(() => setMounted(true), []);

  // Live preference, not read once at mount — same matchMedia-into-state
  // shape components/EBrochureViewer.tsx and CompanyIntroGallery.tsx use,
  // including the change listener, so toggling it in the OS takes effect
  // immediately rather than only on the next page load.
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!mounted) return null;

  const whatsappUrl = `https://wa.me/${siteConfig.contact.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(tChat("whatsappGreeting"))}`;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reducedMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 grid place-items-center overflow-y-auto p-6 backdrop-blur-[3px]"
          style={{ backgroundColor: "rgba(4,29,44,0.62)" }}
          onClick={onClose}
        >
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.975 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: 14, scale: 0.975 }}
            transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
            className="relative w-full max-w-[25.5rem] rounded-xs bg-white text-center"
            style={{
              padding: "46px 40px 38px",
              boxShadow: "0 32px 80px -24px rgba(4,29,44,0.55)",
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lead-success-heading"
            ref={panelRef}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={onClose}
              aria-label={t("closeLabel")}
              ref={closeButtonRef}
              className="absolute right-3.5 top-3.5 flex h-[34px] w-[34px] items-center justify-center rounded-xs text-ink-muted transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
            >
              <X size={17} aria-hidden />
            </button>

            <div className="flex flex-col items-center gap-[18px]">
              <span
                className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-100"
                style={{ boxShadow: "0 0 0 8px rgba(232,179,132,0.16)" }}
              >
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <motion.path
                    d="M5 13l4 4L19 7"
                    stroke="var(--color-accent-600)"
                    strokeWidth={1.9}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={reducedMotion ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={reducedMotion ? { duration: 0 } : { duration: 0.5, delay: 0.18 }}
                  />
                </svg>
              </span>

              <h2
                id="lead-success-heading"
                className="text-[26px] font-normal text-primary"
                style={{ letterSpacing: "-0.012em", textWrap: "balance" }}
              >
                {t("title")}
              </h2>

              <p className="max-w-[16rem] text-[14.5px] leading-relaxed text-ink-muted">{t("body")}</p>

              <div className="mt-1.5 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className={`${BUTTON} bg-primary text-white hover:bg-primary-700`}
                >
                  {t("close")}
                </button>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackWhatsappClick("lead_success_dialog")}
                  className={`${BUTTON} flex items-center gap-2 border border-primary/15 bg-transparent text-primary hover:border-primary`}
                >
                  <WhatsAppGlyph size={15} />
                  {t("whatsapp")}
                </a>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
