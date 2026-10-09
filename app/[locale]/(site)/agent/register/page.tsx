/**
 * app/[locale]/(site)/agent/register/page.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * Public co-agent registration (the mockup's `rf`). `?ref=<refSlug>` ties
 * the sign-up to a sales person's link; a disabled or unknown link shows
 * "ลิงก์นี้ปิดรับแล้ว". No ref = the generic website link. Never indexed.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { resolveAgentRef } from "@/lib/agents/admin";
import { breadcrumbList, trailFor } from "@/lib/seo";
import JsonLd from "@/components/JsonLd";
import Breadcrumb from "@/components/Breadcrumb";
import RegisterForm from "./RegisterForm";

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { locale } = await props.params;
  const t = await getTranslations({ locale, namespace: "coAgents.agentForm" });
  return {
    title: t("metaTitle"),
    robots: { index: false, follow: false, nocache: true },
  };
}

export default async function AgentRegisterPage(props: Props) {
  const { locale } = await props.params;
  setRequestLocale(locale);
  const { ref } = await props.searchParams;
  const t = await getTranslations({ locale, namespace: "coAgents.agentForm" });
  const refSlug = ref ? ref.trim().toLowerCase().slice(0, 40) : null;
  const link = await resolveAgentRef(refSlug);
  const tNav = await getTranslations({ locale, namespace: "nav" });
  const trail = trailFor(locale, [
    { name: tNav("home"), path: "" },
    { name: t("title"), path: "/agent/register" },
  ]);

  return (
    <article className="container-luxe max-w-xl pb-24 pt-28 sm:pt-36">
      <JsonLd id="breadcrumb-schema" data={breadcrumbList(trail)} />
      <Breadcrumb items={trail} className="mb-5" />
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
