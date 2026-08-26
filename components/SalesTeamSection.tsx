/**
 * components/SalesTeamSection.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Our Sales" — shown only on /about and /contact, nowhere else (not the
 * home page, not project pages). See those two page files for the only
 * two places this is rendered.
 *
 * Server component: fetches its own data (lib/sales-team.ts) rather than
 * taking it as a prop, since every caller wants the same active list and
 * there is no per-page filtering to justify pushing the fetch up a level.
 *
 * Locale is read here via next-intl's getLocale() rather than passed down
 * as a prop. Note: next-intl's useLocale() hook also works in Server
 * Components in principle, but this component's body is async (it awaits
 * its own data fetch), and eslint-plugin-react-hooks flags any hook call
 * inside an async function regardless of the component type — getLocale()
 * is the async equivalent designed for exactly this shape, and it's what
 * getTranslations() below already is. `name`/`position` arrive already
 * locale-resolved from lib/sales-team.ts (via getTranslation() against
 * SalesPersonTranslation, falling back to the deprecated nameEn/Th and
 * positionEn/Th pairs) — this component no longer picks the language
 * itself, since a fixed th/en pickLocale() can't express zh/ru.
 *
 * Renders nothing when there are no active sales people, matching
 * FaqAccordion's convention — an empty section heading is worse than no
 * section.
 * ─────────────────────────────────────────────────────────────────────────
 */

import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { Mail, Phone } from "lucide-react";
import Reveal from "@/components/Reveal";
import { getSalesTeam } from "@/lib/sales-team";

export default async function SalesTeamSection() {
  const locale = await getLocale();
  const [t, tCommon, tChat, team] = await Promise.all([
    getTranslations("salesTeam"),
    getTranslations("common"),
    getTranslations("chatButtons"),
    getSalesTeam(locale),
  ]);

  if (team.length === 0) return null;

  return (
    <section className="py-20 sm:py-28">
      <div className="container-luxe">
        <Reveal>
          <h2 className="text-3xl font-light text-primary sm:text-4xl">{t("title")}</h2>
          <div className="horizon-divider my-6 ml-0" />
        </Reveal>

        {/*
          Rebuilt to match the site's established card CI (same shape as
          FacilityCard's caption treatment) instead of the previous generic
          SaaS-style card — thin
          border-primary/10 + shadow-card rather than a heavy rounded-24px
          shadow, text-primary/accent-700 instead of one-off hex greys, and
          smaller, lighter type throughout (name text-sm font-medium,
          position as an uppercase accent-700 label, contact rows text-xs).
        */}
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {team.map((person, index) => {
            const { name, position } = person;

            // Same wa.me construction as contact/page.tsx and layout.tsx
            const waNumber = person.whatsappNumber.replace(/\D/g, "");
            const waGreeting = encodeURIComponent(tChat("whatsappGreeting"));
            const whatsappUrl = `https://wa.me/${waNumber}?text=${waGreeting}`;

            return (
              <Reveal key={person.id} delay={index * 0.1}>
                <div className="flex h-full flex-col rounded-sm border border-primary/10 bg-white p-7 shadow-card">
                  <div className="flex items-center gap-4">
                    <span className="relative shrink-0">
                      {person.photoUrl ? (
                        <span className="relative block h-14 w-14 overflow-hidden rounded-full bg-primary/5">
                          <Image
                            src={person.photoUrl}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-lg font-medium text-accent-700"
                        >
                          {name.trim().charAt(0)}
                        </span>
                      )}
                      <span
                        aria-hidden
                        className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500"
                      />
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-primary">{name}</p>
                      <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-accent-700">
                        {position}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-1 flex-col justify-end gap-2 border-t border-primary/10 pt-5 text-xs">
                    <a
                      href={`tel:${person.phoneNumber}`}
                      aria-label={tCommon("callUs")}
                      className="flex items-center gap-2.5 text-ink/70 transition-colors hover:text-primary"
                    >
                      <Phone size={14} className="shrink-0 text-ink/40" aria-hidden />
                      {person.phoneNumber}
                    </a>

                    {person.email && (
                      <a
                        href={`mailto:${person.email}`}
                        aria-label={tCommon("emailUs")}
                        className="flex items-center gap-2.5 text-ink/70 transition-colors hover:text-primary"
                      >
                        <Mail size={14} className="shrink-0 text-ink/40" aria-hidden />
                        <span className="truncate">{person.email}</span>
                      </a>
                    )}

                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center justify-center gap-2 rounded-sm border border-accent-700/25 px-4 py-2 font-medium uppercase tracking-wide text-accent-700 transition-colors hover:bg-accent-700/5"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="13"
                        height="13"
                        fill="currentColor"
                        className="shrink-0"
                        aria-hidden
                      >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                      </svg>
                      WhatsApp
                    </a>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}