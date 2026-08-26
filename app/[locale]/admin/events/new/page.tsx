import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Role } from "@prisma/client";
import { requireAdmin } from "@/lib/admin/guard";
import { createEvent } from "../actions";
import EventForm from "@/components/admin/EventForm";

type Props = { params: { locale: string } };

export default async function NewEventPage({ params: { locale } }: Props) {
  // Creating an event commits the company to a date; editors may edit but
  // not schedule one.
  await requireAdmin(locale, Role.ADMIN);

  const t = await getTranslations({ locale, namespace: "admin" });

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

      <EventForm
        locale={locale}
        action={createEvent.bind(null, locale)}
        submitLabel={t("common.create")}
      />
    </div>
  );
}
