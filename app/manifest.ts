/**
 * app/manifest.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Web app manifest, served at /manifest.webmanifest.
 *
 * Generated rather than committed as static JSON so the name, colours and
 * default locale stay tied to config/site.ts — three more strings that
 * cannot drift out of sync with the rest of the brand.
 *
 * ⚠ The icon files it points at do not exist yet. The manifest is valid
 * without them; Android will simply fall back to a screenshot of the page
 * for the home-screen icon. See docs/LAUNCH_CHECKLIST.md.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
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
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Android masks icons to its own shape — a "maskable" variant needs
        // its artwork inside the safe zone or the logo gets cropped.
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
