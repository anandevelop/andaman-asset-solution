import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { parseEditingLocale } from "@/lib/admin/translated-form";
import { createEvent } from "../actions";
import EventForm from "@/components/admin/EventForm";
import LanguageTabs from "@/components/admin/LanguageTabs";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import { zoneEyebrow } from "@/lib/admin/nav";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ lang?: string }> };

export default async function NewEventPage(props: Props) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    locale
  } = params;

  // Creating an event commits the company to a date; editors may edit but
  // not schedule one.
  await requireAdmin(locale, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });
  const lang = parseEditingLocale(searchParams.lang);

  return (
    <div className="space-y-8">
      <AdminPageHeader
        back={{ href: `/${locale}/admin/events`, label: t("events.title") }}
        eyebrow={zoneEyebrow((key) => t(key as never), "events")}
        title={t("events.newTitle")}
      />

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
