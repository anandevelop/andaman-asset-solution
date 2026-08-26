import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale } from "@/lib/admin/translated-form";
import { createEvent } from "../actions";
import EventForm from "@/components/admin/EventForm";
import LanguageTabs from "@/components/admin/LanguageTabs";

type Props = { params: { locale: string }; searchParams: { lang?: string } };

export default async function NewEventPage({ params: { locale }, searchParams }: Props) {
  // Creating an event commits the company to a date; editors may edit but
  // not schedule one.
  await requireAdmin(locale, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });
  const lang = parseEditingLocale(searchParams.lang);

  return (
    <div className="space-y-8">
      <header>
        <Link
          href={`/${locale}/admin/events`}
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-primary"
        >
          <ArrowLeft size={14} aria-hidden />
          {t("events.title")}
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-primary sm:text-3xl">
          {t("events.newTitle")}
        </h1>
      </header>

      <LanguageTabs
        active={lang}
        completeness={{ en: false, th: false, zh: false, ru: false }}
        completeLabel={t("common.translationComplete")}
        missingLabel={t("common.translationMissing")}
      />

      <EventForm
        key={lang}
        locale={locale}
        lang={lang}
        action={createEvent.bind(null, locale)}
        submitLabel={t("common.create")}
      />
    </div>
  );
}
