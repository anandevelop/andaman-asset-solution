/**
 * app/[locale]/club/layout.tsx — ANDAMAN CLUB member portal shell.
 * ─────────────────────────────────────────────────────────────────────────
 * Served as member.andamanassetsolution.com/* (the proxy rewrites it here)
 * and directly as /<locale>/club on localhost. Private by design: noindex,
 * no referrer, no social cards.
 *
 * Theme: the `club_theme` cookie picks `.club-dark` (default) or
 * `.club-light` on the root <div>; "auto" renders dark and the inline
 * script below swaps to light before first paint when the OS is light.
 * PortalRuntime follows later OS changes and registers the offline SW.
 *
 * Mobile-first: one centred column, max-w-md, no phone frame.
 * ─────────────────────────────────────────────────────────────────────────
 */
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { setRequestLocale } from "next-intl/server";
import { getSession } from "@/lib/club/session";
import { readTheme } from "@/lib/club/portal-actions-helpers";
import PortalRuntime from "@/components/club/PortalRuntime";

const ROOT_ID = "club-root";

// Static string, no user input: runs once while the HTML parses.
const AUTO_THEME_SCRIPT = `(function(){var e=document.getElementById("${ROOT_ID}");if(e&&e.getAttribute("data-theme")==="auto"&&window.matchMedia("(prefers-color-scheme: light)").matches){e.classList.remove("club-dark");e.classList.add("club-light")}})()`;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return {
    title: { absolute: "ANDAMAN CLUB" },
    description: null,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
    referrer: "no-referrer",
    alternates: { canonical: null, languages: {} },
    openGraph: null,
    twitter: null,
    manifest: `/${locale}/club/manifest.webmanifest`,
    appleWebApp: { capable: true, title: "Andaman", statusBarStyle: "black-translucent" },
    formatDetection: { telephone: false, email: false, address: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  colorScheme: "dark light",
  viewportFit: "cover",
};

export default async function ClubLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [theme, session] = await Promise.all([readTheme(), getSession()]);

  return (
    <div
      id={ROOT_ID}
      data-theme={theme}
      className={`${theme === "light" ? "club-light" : "club-dark"} min-h-dvh bg-club-bg text-club-text antialiased [-webkit-tap-highlight-color:transparent]`}
      suppressHydrationWarning
    >
      <script dangerouslySetInnerHTML={{ __html: AUTO_THEME_SCRIPT }} />
      <div className="mx-auto min-h-dvh w-full max-w-md">{children}</div>
      <PortalRuntime rootId={ROOT_ID} theme={theme} signedIn={Boolean(session)} />
    </div>
  );
}
