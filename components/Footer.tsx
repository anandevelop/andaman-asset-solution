import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import {
  Facebook,
  Instagram,
  Youtube,
  MapPin,
  Mail,
  Phone,
  ArrowRight,
  Clock
} from "lucide-react";
import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/settings";
import { getPublishedProjects } from "@/lib/projects";
import CookiePreferencesLink from "@/components/CookiePreferencesLink";
import type { Locale } from "@/i18n";

/**
 * Async server component. Contact details come from lib/settings.ts; every
 * label goes through the `footer`/`nav` namespaces (see messages/*.json) so
 * zh/ru visitors see real translations rather than the English/Thai text
 * this component used to hardcode.
 */
export default async function Footer() {
  const locale = (await getLocale()) as Locale;

  const [t, tNav, settings, projects] = await Promise.all([
    getTranslations("footer"),
    getTranslations("nav"),
    getSiteSettings(),
    getPublishedProjects(locale),
  ]);

  // Three most prominent published projects, same ordering as the
  // /projects listing's default sort — not a fixed, hand-maintained list
  // that silently drifts from what's actually published (and was never
  // translated at all before this).
  const featuredProjects = projects.slice(0, 3);

  const officeHours = settings.contact?.officeHours?.[locale] || "";
  const address = settings.contact?.address?.[locale] || "";

  return (
    <footer className="bg-primary text-white">
      {/* 1. Top Section: Information & Navigation Grid */}
      <div className="container-luxe grid gap-12 py-16 lg:grid-cols-6 lg:gap-8 lg:py-20">
        
        {/* Column 1: Brand, Address & CTA */}
        <div className="lg:col-span-2 lg:pr-12">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Andaman Asset Solution Co., Ltd."
            width={180}
            height={36}
            className="h-8 w-auto brightness-0 invert"
          />
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-white/60 font-light">
            {siteConfig.description[locale]}
          </p>
          <div className="mt-8">
            {/* White pill per brand CI (primary navy + accent tan are the
                other two brand colors, both already used elsewhere on this
                page — white reads as the third, neutral option against the
                dark footer). Arrow circle inverts to solid navy so it
                stays visible against the same white pill, rather than
                white-on-white. */}
            <Link
              href={`/${locale}/contact`}
              className="group inline-flex items-center gap-3 rounded-full bg-white px-6 py-2.5 text-sm font-medium text-primary transition-all duration-300 hover:bg-white/90"
            >
              {t("contactUs")}
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white">
                <ArrowRight size={14} strokeWidth={2.5} />
              </div>
            </Link>
          </div>
        </div>

        {/* Column 2: Navigation Links */}
        <div>
          <p className="font-medium tracking-wide uppercase text-white text-sm mb-6">{t("menu")}</p>
          <ul className="space-y-4 text-sm text-white/60 font-light">
            {siteConfig.nav.main.map((item) => (
              <li key={item.key}>
                <Link
                  href={`/${locale}${item.href}`}
                  className="transition-colors duration-300 hover:text-white"
                >
                  {tNav(item.key as never)}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* Column 3: Projects */}
        <div>
          <p className="font-medium tracking-wide uppercase text-white text-sm mb-6">{t("projectsHeading")}</p>
          <ul className="space-y-4 text-sm text-white/60 font-light">
            {featuredProjects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/${locale}/projects/${project.slug}`}
                  className="transition-colors duration-300 hover:text-white"
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

       {/* Column 4: Office Information (Updated Layout) */}
        <div className="lg:col-span-2">
          <p className="font-medium tracking-wider uppercase text-white text-sm mb-8">
            {t("office")}
          </p>

          <ul className="space-y-6 text-sm font-light">

            {/* Phone */}
            <li className="flex items-start gap-4 group">
              <Phone size={15} strokeWidth={1.5} className="shrink-0 mt-1 text-accent transition-colors group-hover:text-white" />
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">{t("phone")}</span>
                <a href={`tel:${settings.contact.phone}`} className="text-white/80 transition-colors group-hover:text-white leading-relaxed">
                  {settings.contact.phoneDisplay}
                </a>
              </div>
            </li>

            {/* Email */}
            <li className="flex items-start gap-4 group">
              <Mail size={15} strokeWidth={1.5} className="shrink-0 mt-1 text-accent transition-colors group-hover:text-white" />
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">{t("email")}</span>
                <a href={`mailto:${settings.contact.email}`} className="text-white/80 transition-colors group-hover:text-white break-words leading-relaxed">
                  {settings.contact.email}
                </a>
              </div>
            </li>

            {/* Address */}
            {address && (
              <li className="flex items-start gap-4 group cursor-default">
                <MapPin size={15} strokeWidth={1.5} className="shrink-0 mt-1 text-accent transition-colors group-hover:text-white" />
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">{t("address")}</span>
                  <span className="text-white/80 transition-colors group-hover:text-white leading-relaxed">
                    {address}
                  </span>
                </div>
              </li>
            )}

            {/* Office Hours */}
            {officeHours && (
              <li className="flex items-start gap-4 group cursor-default">
                <Clock size={15} strokeWidth={1.5} className="shrink-0 mt-1 text-accent transition-colors group-hover:text-white" />
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold tracking-widest text-white/40 uppercase">{t("openingHours")}</span>
                  <span className="text-white/80 transition-colors group-hover:text-white leading-relaxed">
                    {officeHours}
                  </span>
                </div>
              </li>
            )}

          </ul>
        </div>
      </div>

      {/* 2. Middle Section: Contact Bar & Socials */}
      <div className="container-luxe pb-10">
        <div className="flex flex-col items-center justify-between gap-6 rounded-2xl border border-white/10 bg-white/5 px-6 py-5 md:flex-row lg:px-8">
          
          <div className="flex flex-col items-center gap-4 text-sm font-light text-white/60 sm:flex-row sm:gap-6 md:justify-start">
            <span className="cursor-pointer transition-colors hover:text-white">
              {t("joinOurTeam")}
            </span>
            <span className="hidden text-white/20 sm:inline">|</span>
            <span className="cursor-pointer transition-colors hover:text-white">
              {t("partnerRegistration")}
            </span>
          </div>

          <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-4">
            {/* Phone moved to the list above, you can keep or remove this one in the contact bar based on preference. */}
            <a 
              href={`tel:${settings.contact.phone}`} 
              className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/20 px-6 py-2.5 text-sm font-medium text-white transition-colors duration-300 hover:bg-white/10 hover:border-white/40"
            >
              <Phone size={14} className="text-accent" />
              {settings.contact.phoneDisplay}
            </a>
            
            <div className="flex items-center gap-3">
              <a href={settings.social.facebook} aria-label="Facebook" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/60 transition-colors duration-300 hover:border-white/40 hover:text-white hover:bg-white/5">
                <Facebook size={16} />
              </a>
              <a href={settings.social.instagram} aria-label="Instagram" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/60 transition-colors duration-300 hover:border-white/40 hover:text-white hover:bg-white/5">
                <Instagram size={16} />
              </a>
              <a href={settings.social.youtube} aria-label="YouTube" className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white/60 transition-colors duration-300 hover:border-white/40 hover:text-white hover:bg-white/5">
                <Youtube size={16} />
              </a>
            </div>
          </div>
          
        </div>
      </div>

      {/* 3. Bottom Section: Copyright & Legal */}
      <div className="border-t border-white/5">
        <div className="container-luxe flex flex-col items-center justify-between gap-4 py-6 pb-24 md:flex-row md:pb-6">
          <p className="text-center text-xs text-white/40 font-light md:text-left">
            © {new Date().getFullYear()} {siteConfig.legalName} — {t("rightsReserved")}
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-white/40 font-light md:gap-6">
            <Link href={`/${locale}/terms`} className="transition-colors hover:text-white">{t("terms")}</Link>
            <Link href={`/${locale}/privacy-policy`} className="transition-colors hover:text-white">{t("privacyPolicy")}</Link>
            <CookiePreferencesLink label={t("cookiesPreferences")} />
          </div>
        </div>
      </div>
    </footer>
  );
}