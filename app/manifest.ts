/**
 * app/manifest.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Web app manifest, served at /manifest.webmanifest.
 *
 * Generated rather than committed as static JSON so the name, colours and
 * default locale stay tied to config/site.ts — three more strings that
 * cannot drift out of sync with the rest of the brand.
 *
 * Async because the icons are admin-editable (lib/settings.ts). Without
 * that, an operator uploads a new mark, watches the browser tab change,
 * adds the site to an Android home screen and gets the old one — a support
 * ticket whose only honest answer is "there are two icon systems". The read
 * is unstable_cache-backed and falls back to config/site.ts on any failure,
 * so an unreachable database yields the committed icons rather than a
 * broken manifest.
 *
 * `description` deliberately stays on siteConfig rather than following the
 * new seo.metaDescription setting: an install-prompt blurb, a SERP snippet
 * and the footer paragraph are three different artefacts, and one field
 * driving all three means tuning the snippet silently rewrites the others.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/settings";
import { buildManifestIcons } from "@/lib/seo";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { branding } = await getSiteSettings();

  return {
    name: siteConfig.name,
    short_name: siteConfig.shortName,
    // description now covers all 4 locales (see config/site.ts) — indexing
    // by defaultLocale just works.
    description: siteConfig.description[siteConfig.defaultLocale],
    // The middleware redirects "/" to the locale prefix; starting there
    // directly saves an install-launch redirect.
    start_url: `/${siteConfig.defaultLocale}`,
    scope: "/",
    display: "standalone",
    background_color: "#f9f9fa",
    theme_color: "#083551",
    lang: siteConfig.defaultLocale,
    dir: "ltr",
    categories: ["business", "lifestyle", "travel"],
    /*
      Android masks icons to its own shape, so the "maskable" variant needs
      its artwork inside the safe zone or the logo gets cropped — which is
      why buildManifestIcons keeps that entry on the committed asset even
      when an operator has uploaded their own mark for the others.
    */
    icons: buildManifestIcons(branding.faviconUrl),
  };
}
