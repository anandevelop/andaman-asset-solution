import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  ArrowRight,
  Clock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
} from "lucide-react";
// lucide dropped every brand mark in 1.0 — see components/BrandGlyphs.tsx.
import { Facebook, Instagram, Youtube } from "@/components/BrandGlyphs";
import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/settings";
import { getPublishedProjects } from "@/lib/projects";
import CookiePreferencesLink from "@/components/CookiePreferencesLink";
import type { Locale } from "@/i18n";

/**
 * components/Footer.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Async server component. Contact details come from lib/settings.ts; every
 * label goes through the `footer`/`nav` namespaces (see messages/*.json) so
 * zh/ru visitors see real translations rather than the English/Thai text
 * this component used to hardcode.
 *
 * FOUR COLUMNS, GROUPED BY WHAT A VISITOR IS LOOKING FOR
 *
 * "Developments" is the projects a person came here to see, plus the two
 * pages about them; "Company" is everything else worth linking to. That
 * split replaced one long "Menu" column that repeated the header verbatim
 * and a second column of project names beside it — the same links, sorted
 * by which navigation they happened to be configured in rather than by
 * what anybody was looking for.
 *
 * The projects in that column are the three most prominent *published*
 * ones, in the same order /projects sorts them — not a hand-maintained
 * list that drifts from what is actually live.
 *
 * WHAT WENT AND WHY
 *
 * The "Join our team | Partner registration" bar is gone. Both were
 * <span>s with no href: text styled as links that had never gone
 * anywhere, on every page of the site.
 *
 * `text-white/55`, not the `text-white/40` every muted label here used to
 * be: white at 40% over this footer's #083551 lands on #6b8697, 3.34:1 —
 * a fail for the 11-12px labels and legal links it was used on, and what
 * axe flagged on every page (the footer renders everywhere). 55% is
 * #90a4b1, 4.96:1, the same "smallest passing step plus a margin" call as
 * the ink/65 fix in Navbar.tsx.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default async function Footer() {
  const locale = (await getLocale()) as Locale;

  const [t, tNav, tChat, settings, projects] = await Promise.all([
    getTranslations("footer"),
    getTranslations("nav"),
    getTranslations("chatButtons"),
    getSiteSettings(),
    getPublishedProjects(locale),
  ]);

  const featuredProjects = projects.slice(0, 3);

  const officeHours = settings.contact?.officeHours?.[locale] || "";
  const address = settings.contact?.address?.[locale] || "";
  // The sales inbox is the one a visitor wants; the general one is the
  // fallback for a deployment that has not set a separate sales address.
  const salesEmail = settings.contact.salesEmail || settings.contact.email;

  const whatsappUrl = `https://wa.me/${settings.contact.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(
    tChat("whatsappGreeting"),
  )}`;

  /** The square outline buttons under the CTA — every channel this site
   *  actually has a link for, and none it does not. */
  const channels = [
    { key: "whatsapp", href: whatsappUrl, label: "WhatsApp", Icon: MessageCircle, external: true },
    { key: "facebook", href: settings.social.facebook, label: "Facebook", Icon: Facebook, external: true },
    { key: "instagram", href: settings.social.instagram, label: "Instagram", Icon: Instagram, external: true },
    { key: "youtube", href: settings.social.youtube, label: "YouTube", Icon: Youtube, external: true },
  ].filter((channel) => Boolean(channel.href));

  const companyLinks = [
    { key: "about", href: "/about" },
    { key: "achievements", href: "/achievements" },
    { key: "news", href: "/news" },
    { key: "events", href: "/events" },
    { key: "eBrochure", href: "/e-brochure" },
  ] as const;

  const columnHeading = "text-[11px] font-semibold uppercase tracking-[0.18em] text-white";
  const columnLink =
    "text-sm font-light text-white/70 transition-colors duration-300 hover:text-white";

  return (
    <footer className="bg-primary text-white">
      <div className="container-luxe grid gap-12 py-16 lg:grid-cols-12 lg:gap-8 lg:py-20">
        {/* ── Brand ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-5 lg:pr-12">
          {/*
            The committed logo is dark artwork on transparency, so this
            panel's navy background needs it flipped to white — hence
            `brightness-0 invert`. An uploaded logo gets no such treatment:
            whoever uploads one has been told to supply dark artwork, but
            if they supply light artwork instead, inverting it would render
            it invisible here with nothing on screen to explain why. Left
            alone, a wrong upload looks wrong immediately, which is the
            failure they can actually act on.
          */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={settings.branding.logoUrl}
            alt={siteConfig.legalName}
            width={180}
            height={36}
            className={`h-8 w-auto ${
              settings.branding.logoUrl === siteConfig.branding.logo ? "brightness-0 invert" : ""
            }`}
          />

          {/* Its own line rather than siteConfig.description, which is the
              SERP snippet and the PWA install blurb as well — three
              artefacts written to three different budgets, and tuning the
              snippet should not silently rewrite the footer. */}
          <p className="mt-6 max-w-sm text-sm font-light leading-relaxed text-white/60">
            {t("blurb")}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {/* White, square: navy and accent are the other two brand
                colours and both are already spoken for on this page, so
                white reads as the third, neutral option. */}
            <Link
              href={`/${locale}/contact`}
              className="group inline-flex items-center gap-3 bg-white px-7 py-3.5 text-xs font-medium uppercase tracking-[0.16em] text-primary transition-colors duration-300 hover:bg-white/90"
            >
              {t("contactUs")}
              <ArrowRight
                size={14}
                strokeWidth={2}
                className="transition-transform group-hover:translate-x-1"
                aria-hidden
              />
            </Link>

            <div className="flex items-center gap-2">
              {channels.map(({ key, href, label, Icon }) => (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={label}
                  className="flex h-11 w-11 items-center justify-center border border-white/20 text-white/70 transition-colors duration-300 hover:border-white/50 hover:bg-white/5 hover:text-white"
                >
                  <Icon size={16} strokeWidth={1.5} aria-hidden />
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* ── Developments ──────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <p className={columnHeading}>{t("developments")}</p>
          <ul className="mt-6 space-y-4">
            {featuredProjects.map((project) => (
              <li key={project.id}>
                <Link href={`/${locale}/projects/${project.slug}`} className={columnLink}>
                  {project.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href={`/${locale}/projects`} className={columnLink}>
                {t("allProjects")}
              </Link>
            </li>
            <li>
              <Link href={`/${locale}/progress`} className={columnLink}>
                {tNav("progress")}
              </Link>
            </li>
          </ul>
        </div>

        {/* ── Company ───────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <p className={columnHeading}>{t("company")}</p>
          <ul className="mt-6 space-y-4">
            {companyLinks.map((item) => (
              <li key={item.key}>
                <Link href={`/${locale}${item.href}`} className={columnLink}>
                  {tNav(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Get in touch ──────────────────────────────────────────── */}
        <div className="lg:col-span-3">
          <p className={columnHeading}>{t("getInTouch")}</p>

          <ul className="mt-6 space-y-5 text-sm font-light">
            <li className="group flex items-start gap-3.5">
              <Phone
                size={15}
                strokeWidth={1.5}
                className="mt-0.5 shrink-0 text-accent transition-colors group-hover:text-white"
                aria-hidden
              />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  {t("phone")}
                </span>
                <a
                  href={`tel:${settings.contact.phone}`}
                  className="leading-relaxed text-white/80 transition-colors group-hover:text-white"
                >
                  {settings.contact.phoneDisplay}
                </a>
              </div>
            </li>

            <li className="group flex items-start gap-3.5">
              <Mail
                size={15}
                strokeWidth={1.5}
                className="mt-0.5 shrink-0 text-accent transition-colors group-hover:text-white"
                aria-hidden
              />
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                  {t("sales")}
                </span>
                <a
                  href={`mailto:${salesEmail}`}
                  className="wrap-break-word leading-relaxed text-white/80 transition-colors group-hover:text-white"
                >
                  {salesEmail}
                </a>
              </div>
            </li>

            {address && (
              <li className="group flex cursor-default items-start gap-3.5">
                <MapPin
                  size={15}
                  strokeWidth={1.5}
                  className="mt-0.5 shrink-0 text-accent transition-colors group-hover:text-white"
                  aria-hidden
                />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                    {t("office")}
                  </span>
                  <span className="leading-relaxed text-white/80 transition-colors group-hover:text-white">
                    {address}
                  </span>
                </div>
              </li>
            )}

            {officeHours && (
              <li className="group flex cursor-default items-start gap-3.5">
                <Clock
                  size={15}
                  strokeWidth={1.5}
                  className="mt-0.5 shrink-0 text-accent transition-colors group-hover:text-white"
                  aria-hidden
                />
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
                    {t("openingHours")}
                  </span>
                  <span className="leading-relaxed text-white/80 transition-colors group-hover:text-white">
                    {officeHours}
                  </span>
                </div>
              </li>
            )}
          </ul>
        </div>
      </div>

      {/* ── Legal ─────────────────────────────────────────────────────
          `pb-24` on phones clears the floating chat buttons, which sit
          bottom-right and would otherwise land on top of these links. */}
      <div className="border-t border-white/10">
        <div className="container-luxe flex flex-col items-center justify-between gap-4 py-6 pb-24 md:flex-row md:pb-6">
          <p className="text-center text-xs font-light text-white/55 md:text-left">
            © {new Date().getFullYear()} {siteConfig.legalName} — {t("rightsReserved")}
          </p>

          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs font-light text-white/55 md:gap-6">
            <Link href={`/${locale}/privacy-policy`} className="transition-colors hover:text-white">
              {t("privacyPolicy")}
            </Link>
            <Link href={`/${locale}/terms`} className="transition-colors hover:text-white">
              {t("terms")}
            </Link>
            <CookiePreferencesLink label={t("cookiesPreferences")} />
          </div>
        </div>
      </div>
    </footer>
  );
}
