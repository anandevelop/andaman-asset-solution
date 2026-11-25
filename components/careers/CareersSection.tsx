/**
 * components/careers/CareersSection.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Join our team", at the end of the About page: the invitation, the open
 * positions and the way in to the application form.
 *
 * On About because that is where somebody deciding whether to work here
 * goes to read about the company, and not in the main menu, which is for
 * people buying a villa. The footer links to #careers from every page.
 *
 * The invitation's wording is HR's when they have written one
 * (lib/careers/config.ts) and the site's own messages otherwise.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n";
import { getCareersConfig } from "@/lib/careers/config";
import { getOpenPositions } from "@/lib/careers/positions";
import CareersPositions from "@/components/careers/CareersPositions";

export default async function CareersSection({ locale }: { locale: string }) {
  const [t, config, positions] = await Promise.all([
    getTranslations({ locale, namespace: "careers" }),
    getCareersConfig(),
    getOpenPositions(locale),
  ]);

  const copy = config.copy[locale as Locale];

  return (
    <section id="careers" className="scroll-mt-24 border-y border-ink/10 bg-surface-muted py-16 sm:py-24">
      <div className="container-luxe grid gap-10 lg:grid-cols-[5fr_6fr] lg:gap-16">
        <div>
          <p className="eyebrow">{t("eyebrow")}</p>
          <h2 className="mt-3 text-balance text-3xl font-light leading-[1.2] text-primary sm:text-4xl">
            {copy?.title || t("title")}
          </h2>
          <p className="mt-5 max-w-[44ch] whitespace-pre-line text-base font-light leading-relaxed text-ink/75">
            {copy?.intro || t("intro")}
          </p>
        </div>

        <CareersPositions
          locale={locale}
          positions={positions}
          retentionMonths={config.retentionMonths}
          hrEmail={config.notifyEmail}
        />
      </div>
    </section>
  );
}
