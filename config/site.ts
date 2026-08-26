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
    officeHours: {
      en: "Daily 09:00–18:00 (GMT+7)",
      th: "ทุกวัน 09:00–18:00 น.",
      zh: "每日 09:00–18:00（GMT+7）",
      ru: "Ежедневно 09:00–18:00 (GMT+7)",
    },
    mapUrl: "https://maps.google.com/?q=Cherngtalay+Phuket",
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

  legal: {
    privacyPolicyPath: "/privacy-policy",
    termsPath: "/terms",
    consentVersion: "privacy-policy-v1",
  },
} as const;

export type SiteConfig = typeof siteConfig;
