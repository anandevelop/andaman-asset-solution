/**
 * app/[locale]/(site)/agent/register/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Public co-agent registration (the mockup's `rf`). `?ref=<refSlug>` ties
 * the sign-up to a sales person's link; a disabled or unknown link shows
 * "ลิงก์นี้ปิดรับแล้ว". No ref = the generic website link. Never indexed.
 * Shown bare: no navbar, sales strip, closing CTA or footer.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveAgentRef } from "@/lib/agents/admin";
import { breadcrumbList, trailFor } from "@/lib/seo";
import { pageOpenGraph } from "@/lib/page-open-graph";
import JsonLd from "@/components/JsonLd";
import Link from "next/link";
import { LOCALE_DISPLAY_ORDER } from "@/i18n";
import { siteConfig } from "@/config/site";
import { getSiteSettings } from "@/lib/settings";
import { localizedAlternates } from "@/lib/seo";
import RegisterForm from "./RegisterForm";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "coAgents.agentForm" });
  return {
    // The layout's template adds "| Andaman Asset Solution"; the message
    // carried it too, so the tab said it twice.
    title: t("metaTitle"),
    // Its own description and canonical, rather than inheriting the home
    // page's.
    description: t("subtitle"),
    alternates: localizedAlternates(locale, "/agent/register"),
    openGraph: await pageOpenGraph(locale, "/agent/register"),
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function AgentRegisterPage(props: Props) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const { ref } = await props.searchParams;
  const t = await getTranslations({ locale, namespace: "coAgents.agentForm" });
  const refSlug = ref ? ref.trim().toLowerCase().slice(0, 40) : null;
  const [link, settings] = await Promise.all([resolveAgentRef(refSlug), getSiteSettings()]);
  const tNav = await getTranslations({ locale, namespace: "nav" });
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: t("title"), path: "/agent/register" },
  ]);

  return (
    <article className="container-luxe max-w-xl pb-20 pt-8 sm:pt-12">
      <JsonLd id="breadcrumb-schema" data={breadcrumbList(trail)} />
      {/*
        This page has no navbar and no footer (BARE_ROUTES in
        lib/public-paths.ts): an agent arrives from a link a sales person
        sent, to do one thing. What is left of the site's chrome is the
        logo, which says whose form this is, and the four languages —
        the people it is sent to read Thai, English, Chinese or Russian,
        and the navbar was where they changed it. The links keep ?ref, so
        changing language does not lose which sales person invited them.
      */}
      <div className="mb-10 flex items-center justify-between gap-4 border-b border-ink/10 pb-5">
        <Link href={`/${locale}`} aria-label={siteConfig.legalName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={settings.branding.logoUrl}
            alt={siteConfig.legalName}
            width={180}
            height={36}
            className={`h-6 w-auto sm:h-7 ${settings.branding.logoUrl === siteConfig.branding.logo ? "brightness-0" : ""}`}
          />
        </Link>
        <nav aria-label={tNav("language")} className="flex items-center gap-1 text-xs">
          {LOCALE_DISPLAY_ORDER.map((code) => (
            <Link
              key={code}
              href={`/${code}/agent/register${refSlug ? `?ref=${encodeURIComponent(refSlug)}` : ""}`}
              hrefLang={code}
              lang={code}
              aria-current={code === locale ? "page" : undefined}
              className={`rounded-xs px-2 py-1.5 uppercase tracking-wide transition-colors ${
                code === locale ? "bg-surface-muted font-medium text-ink" : "text-ink/65 hover:text-ink"
              }`}
            >
              {code}
            </Link>
          ))}
        </nav>
      </div>
      {link.open ? (
        <header className="mb-8">
          <h1 className="mb-2 text-3xl font-semibold text-ink">{t("title")}</h1>
          <p className="text-sm leading-relaxed text-ink-muted">{t("subtitle")}</p>
          {link.salesPerson && (
            <p className="mt-3 inline-block rounded-full bg-accent/10 px-3 py-1 text-xs text-accent-700">
              {t("via", { name: link.salesPerson.nick })}
            </p>
          )}
        </header>
      ) : null}
      <RegisterForm locale={locale} refSlug={link.open ? refSlug : null} closed={!link.open} />
    </article>
  );
}
