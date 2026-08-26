/**
 * app/[locale]/(site)/layout.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Public-facing chrome. Route groups do not appear in the URL, so every
 * page moved in here keeps its original path (/th, /th/projects, …) while
 * /admin and /login — which sit outside this group — render without the
 * marketing Navbar and Footer.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import FloatingChatButton from "@/components/FloatingChatButton";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import { getSiteSettings } from "@/lib/settings";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Navbar is a client component (mobile disclosure, active state), so the
  // live phone number is fetched here and handed down rather than imported.
  const [settings, t] = await Promise.all([
    getSiteSettings(),
    getTranslations("nav"),
  ]);

  const tChat = await getTranslations("chatButtons");

  // Build the WhatsApp URL with a pre-filled greeting. Encoding the message
  // removes ambiguity on every client.
  const waNumber = settings.contact.whatsapp.replace(/\D/g, "");
  const waGreeting = encodeURIComponent(tChat("whatsappGreeting"));
  const whatsappUrl = `https://wa.me/${waNumber}?text=${waGreeting}`;

  return (
    <>
      {/*
        Skip link. Seven nav items plus a language switch and a phone CTA
        sit ahead of the content on every page, so a keyboard user had to
        press Tab nine times per page before reaching anything they came
        for.

        Visually hidden until focused rather than display:none — a hidden
        element is not focusable, so `sr-only` alone would make the link
        unreachable by the very people it exists for. It is positioned
        off-screen and snaps into view on :focus.
      */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60]
          focus:rounded-sm focus:bg-primary focus:px-5 focus:py-3 focus:text-sm
          focus:font-medium focus:text-white"
      >
        {t("skipToContent")}
      </a>

      <Navbar
        phone={settings.contact.phone}
        phoneDisplay={settings.contact.phoneDisplay}
      />

      {/* tabIndex={-1} so the skip link can actually move focus here.
          Without it the browser scrolls but focus stays in the header, and
          the next Tab drops the user back at the top of the nav. */}
      <main id="main" tabIndex={-1} className="focus:outline-none">
        {children}
      </main>

      <Footer />

      {/*
        FloatingChatButton is a client component — it listens to scroll and
        pathname. Props are resolved here (server) so the component gets
        the live values without its own data-fetch.
      */}
      <FloatingChatButton
        whatsappUrl={whatsappUrl}
        whatsappLabel={tChat("whatsappLabel")}
      />

      {/*
        Mounted only inside the public site group, not the root layout —
        /admin and /login structurally never load this banner, and since
        Analytics.tsx (root layout) can't gain consent without it, GA/Pixel
        never mount there either. No extra guard needed for that.
      */}
      <CookieConsentBanner />
    </>
  );
}
