/**
 * config/site.ts
 * ─────────────────────────────────────────────────────────────────────────
 * Single source of truth for brand, contact, and social info.
 * Edit THIS file to update phone numbers, LINE OA, socials, etc. across
 * the entire site — never hardcode contact info inside components/pages.
 * ─────────────────────────────────────────────────────────────────────────
 */

export const siteConfig = {
  name: "Andaman Asset Solution",
  shortName: "Andaman",
  legalName: "Andaman Asset Solution Co., Ltd.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://andamanassetsolution.com",
  description: {
    en: "Luxury pool villas and premium real estate developments in Phuket, curated by Andaman Asset Solution.",
    th: "พูลวิลล่าหรูและอสังหาริมทรัพย์พรีเมียมในภูเก็ต คัดสรรโดย อันดามัน แอสเซท โซลูชัน",
    zh: "安达曼资产解决方案精心甄选的普吉岛豪华泳池别墅及高端房地产项目。",
    ru: "Роскошные виллы с бассейном и элитная недвижимость на Пхукете от Andaman Asset Solution.",
  },
  // Unused elsewhere in the codebase (routing derives locale/defaultLocale
  // from i18n.ts instead) — kept in sync with it regardless, so this never
  // becomes a second, stale source of truth if something starts reading it.
  defaultLocale: (process.env.NEXT_PUBLIC_DEFAULT_LOCALE as "en" | "th" | "zh" | "ru") ?? "th",
  locales: ["en", "th", "zh", "ru"] as const,

  contact: {
    phone: "+66-91-038-9178",
    phoneDisplay: "+66-91-038-9178",
    whatsapp: "+66910389178",
    email: "info@andamanassetsolution.com",
    salesEmail: "sales@andamanassetsolution.com",
    address: {
      en: "141/4 Bandon-Cherngtalay Rd Choeng Thale, Thalang District Phuket 83110",
      th: "141/4 ถนน บ้านดอน-เชิงทะเล Bang Tao Beach, ตำบลเชิงทะเล อำเภอถลาง ภูเก็ต 83110",
      zh: "泰国普吉府他朗县冲塔莱区 Bandon-Cherngtalay 路 141/4 号，邮编 83110",
      ru: "141/4 Bandon-Cherngtalay Rd, Чернгтале, район Таланг, Пхукет 83110, Таиланд",
    },
    /**
     * The opening hours a visitor reads, in four languages.
     *
     * THESE ARE TWO PLACES, NOT ONE. `openingWindow` below is the same
     * hours as machine-readable numbers, and the map's "Open now · closes
     * 18:00" badge is computed from it. Change the office's hours and you
     * must change both — this block is prose (it carries the GMT+7 note,
     * the Thai "น.", a "Daily" the window has no concept of) and parsing
     * it back into numbers across four locales to avoid the duplication
     * would be a worse trade than the duplication.
     */
    officeHours: {
      en: "Daily 09:00–18:00 (GMT+7)",
      th: "ทุกวัน 09:00–18:00 น.",
      zh: "每日 09:00–18:00（GMT+7）",
      ru: "Ежедневно 09:00–18:00 (GMT+7)",
    },
    /** See officeHours above: the same hours, kept in sync by hand. */
    openingWindow: { open: "09:00", close: "18:00", timeZone: "Asia/Bangkok" },

    /**
     * The sales office pin, from the share link below.
     *
     * The map embed is built from these rather than from the address,
     * because MapCard draws its own marker at the centre of the frame and
     * Google's geocoder does not put an address's pin there — searching
     * this address landed a couple of hundred metres off the building, and
     * our pin would have sat on empty road. Overridable at
     * /admin/pages/contact (settings keys contact.latitude/longitude).
     */
    latitude: 7.999478,
    longitude: 98.3101671,
    /* The place itself. Was ?q=Cherngtalay+Phuket, which pointed at the
       sub-district rather than at us. */
    mapUrl: "https://maps.app.goo.gl/QovJtwCdaqWeSTk49",
  },

  /**
   * Phuket International Airport — the "getting here" row in /contact's
   * map panel, and nothing else.
   *
   * Here rather than in the database because it is not ours and will not
   * move. It is also in content/nearby-attractions.ts with a drive time
   * from the projects; that list answers "what is near this villa", this
   * entry answers "how do I reach your office from my flight", and the two
   * are measured from different places.
   */
  airport: {
    name: "Phuket International Airport",
    latitude: 8.1132,
    longitude: 98.3169,
  },

  // No `line` entry here on purpose — the site's only public-facing LINE
  // link (the homepage's "Chat on LINE" button) has been replaced with
  // WhatsApp (see app/[locale]/(site)/page.tsx's Final CTA section), and
  // nothing else in the app read this block. The LINE Messaging API is
  // still used internally for staff lead notifications (lib/line.ts), but
  // that reads its own LINE_* env vars directly rather than through here.
  social: {
    facebook: "https://facebook.com/andamanassetsolution",
    instagram: "https://instagram.com/andamanassetsolution",
    youtube: "https://youtube.com/@andamanassetsolution",
    tiktok: "https://tiktok.com/@andamanassetsolution",
  },

  nav: {
    main: [
      { key: "home", href: "/" },
      { key: "projects", href: "/projects" },
      { key: "progress", href: "/progress" },
      { key: "news", href: "/news" },
      { key: "events", href: "/events" },
      { key: "about", href: "/about" },
      { key: "contact", href: "/contact" },
    ],

    /*
      Pages worth indexing that are deliberately not in the header.

      /achievements is fully built in four locales and sets its own
      canonical and hreflang, but the client declined a top-level Navbar
      item for a single page (see the note above the Milestones link in
      app/[locale]/(site)/about/page.tsx). It was therefore in neither
      nav.main nor app/sitemap.ts, so search engines were never told it
      exists — and tests/routes.test.ts could not see the gap, because it
      only ever checked nav → page and sitemap → nav.

      This list is what the sitemap and the footer read in addition to
      nav.main. The Navbar deliberately does not read it.
    */
    secondary: [
      { key: "achievements", href: "/achievements" },
      /*
        The e-brochure catalogue. Secondary rather than main for the same
        reason as achievements: the header is already at seven items, and
        this is a page people reach from a project or the footer rather
        than one they navigate to first. It still has to be indexed, which
        is exactly what this list is for.
      */
      { key: "eBrochure", href: "/e-brochure" },
    ],
  },

  seo: {
    titleTemplate: "%s | Andaman Asset Solution",
    defaultTitle: {
      en: "Andaman Asset Solution | Luxury Pool Villas in Phuket",
      th: "อันดามัน แอสเซท โซลูชัน | พูลวิลล่าหรูใจกลางภูเก็ต",
      zh: "安达曼资产解决方案 | 普吉岛豪华泳池别墅",
      ru: "Andaman Asset Solution | Роскошные виллы с бассейном на Пхукете",
    },
    keywords: [
      "Phuket pool villa",
      "luxury real estate Phuket",
      "villa for sale Phuket",
      "อสังหาริมทรัพย์ภูเก็ต",
      "พูลวิลล่าภูเก็ต",
    ],
    ogImage: "/og-image.jpg",
    twitterHandle: "@andamanasset",
  },

  /**
   * Brand assets in public/, as the committed fallback behind the
   * admin-editable branding settings (lib/settings.ts).
   *
   * These paths were string literals in six files — app/[locale]/layout.tsx,
   * app/manifest.ts, Navbar, Footer, AdminSidebar and the login page. They
   * are gathered here rather than written into defaultSettings() directly
   * because lib/settings.ts's whole contract is "config/site.ts is always
   * the fallback"; hardcoding "/favicon.ico" there would make it a second
   * source of truth for brand assets, which is the thing that module says
   * it must not become.
   *
   * `ogImage` deliberately stays under `seo` above rather than moving here:
   * tests/routes.test.ts asserts on that exact path, and a social card is a
   * metadata concern rather than an icon.
   */
  branding: {
    favicon: "/favicon.ico",
    logo: "/logo.png",
    appleTouchIcon: "/apple-touch-icon.png",
    icon192: "/icon-192.png",
    icon512: "/icon-512.png",
    /* Android masks icons to its own shape, so this variant has the mark
       rescaled into the safe zone. An operator upload cannot replace it —
       see buildManifestIcons() in lib/seo.ts. */
    iconMaskable: "/icon-maskable-512.png",
  },

  legal: {
    privacyPolicyPath: "/privacy-policy",
    termsPath: "/terms",
    consentVersion: "privacy-policy-v1",
  },
} as const;

export type SiteConfig = typeof siteConfig;
