/**
 * components/SalesTeamSection.tsx
 * ─────────────────────────────────────────────────────────────────────────
 * "Our Sales" — shown on every public page, mounted once in
 * app/[locale]/(site)/layout.tsx (inside <main>, after {children}) rather
 * than imported per-page.
 *
 * Navy cards on the page background, not a navy band. The section used to
 * be one dark block so the bottom of every page ran dark from here to the
 * footer; the cost was that the cards had to be drawn in translucent white
 * on navy and barely separated from the field behind them. Solid navy on
 * the light page reverses the contrast — each person is now a distinct
 * object — and the run of dark still starts one section later, at the
 * closing CTA.
 *
 * EACH CARD OFFERS THE SAME THREE THINGS TWICE, ON PURPOSE
 *
 * The phone number and the email are readable as text — somebody wants to
 * copy them, or dial from a different device — and the row of buttons
 * underneath makes them one tap on a phone. The text is the information;
 * the buttons are the action, and a number nobody can read is no use to
 * the person about to type it into a desk phone.
 *
 * Server component: fetches its own data (lib/sales-team.ts) rather than
 * taking it as a prop, since every caller wants the same active list and
 * there is no per-page filtering to justify pushing the fetch up a level.
 *
 * Locale is read here via next-intl's getLocale() rather than passed down
 * as a prop. next-intl's useLocale() also works in Server Components in
 * principle, but this component's body is async (it awaits its own data
 * fetch), and eslint-plugin-react-hooks flags any hook call inside an
 * async function regardless of the component type — getLocale() is the
 * async equivalent designed for exactly this shape. `name`/`position`
 * arrive already locale-resolved from lib/sales-team.ts.
 *
 * Renders nothing when there are no active sales people, matching
 * FaqAccordion's convention — an empty section heading is worse than no
 * section.
 * ─────────────────────────────────────────────────────────────────────────
 */

import ImageWithSkeleton from "@/components/ImageWithSkeleton";
import { getLocale, getTranslations } from "next-intl/server";
import { Mail, Phone } from "lucide-react";
import Reveal from "@/components/Reveal";
import { getSalesTeam } from "@/lib/sales-team";

/** WhatsApp's own glyph. Inline rather than from lucide, which has no
 *  brand marks — and the whole point of this button is that it looks like
 *  the app it hands you to. */
function WhatsAppGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className="shrink-0"
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

const ICON_BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center border border-white/25 text-white/80 transition-colors hover:border-white/60 hover:bg-white/10 hover:text-white";

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
    <section className="bg-surface py-16 sm:py-20">
      <div className="container-luxe">
        <Reveal>
          <h2 className="text-3xl font-light text-primary sm:text-4xl">{t("title")}</h2>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {team.map((person, index) => {
            const { name, position } = person;

            // Same wa.me construction as contact/page.tsx and SiteCta.
            const waNumber = person.whatsappNumber.replace(/\D/g, "");
            const waGreeting = encodeURIComponent(tChat("whatsappGreeting"));
            const whatsappUrl = `https://wa.me/${waNumber}?text=${waGreeting}`;

            return (
              <Reveal key={person.id} delay={index * 0.08}>
                {/* text-white set on the card, not the section: the section
                    is light now, and every piece of type in here is on navy. */}
                <div className="flex h-full flex-col rounded-xs bg-primary p-6 text-white">
                  <div className="flex items-center gap-4">
                    <span className="relative shrink-0">
                      {person.photoUrl ? (
                        <span className="relative block h-16 w-16 overflow-hidden rounded-full border border-accent/60 bg-white/5">
                          <ImageWithSkeleton
                            src={person.photoUrl}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="flex h-16 w-16 items-center justify-center rounded-full border border-accent/60 bg-white/5 text-lg font-medium text-accent"
                        >
                          {name.trim().charAt(0)}
                        </span>
                      )}

                      {/* Decorative: this marks somebody as a contactable
                          member of the team, not as online right now —
                          there is no presence to read. The border colour
                          matches the card so the dot reads as sitting on
                          it rather than floating. */}
                      <span
                        aria-hidden
                        className="absolute bottom-0.5 right-0.5 block h-3 w-3 rounded-full border-2 border-primary bg-green-500"
                      />
                    </span>

                    <div className="min-w-0">
                      <p className="text-lg font-medium leading-snug text-white">{name}</p>
                      <p className="mt-1 text-[11px] font-medium uppercase leading-snug tracking-[0.14em] text-accent">
                        {position}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 space-y-2.5 text-sm">
                    <a
                      href={`tel:${person.phoneNumber}`}
                      className="flex items-center gap-3 text-white/90 transition-colors hover:text-white"
                    >
                      <Phone size={15} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden />
                      {person.phoneNumber}
                    </a>

                    {person.email && (
                      <a
                        href={`mailto:${person.email}`}
                        className="flex items-center gap-3 text-white/90 transition-colors hover:text-white"
                      >
                        <Mail size={15} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden />
                        <span className="truncate">{person.email}</span>
                      </a>
                    )}
                  </div>

                  {/* mt-auto so a card whose person has no email still puts
                      its buttons on the same line as the others in the row. */}
                  <div className="mt-auto flex items-center gap-2 pt-5">
                    <a href={`tel:${person.phoneNumber}`} aria-label={tCommon("callUs")} className={ICON_BUTTON}>
                      <Phone size={16} strokeWidth={1.5} aria-hidden />
                    </a>

                    {person.email && (
                      <a
                        href={`mailto:${person.email}`}
                        aria-label={tCommon("emailUs")}
                        className={ICON_BUTTON}
                      >
                        <Mail size={16} strokeWidth={1.5} aria-hidden />
                      </a>
                    )}

                    {/* WhatsApp's own green rather than the site's accent:
                        this is the one control on the page that hands the
                        visitor to another app, and it is recognised by its
                        colour before its label is read. */}
                    <a
                      href={whatsappUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-11 flex-1 items-center justify-center gap-2 bg-[#25D366] px-4 text-xs font-medium uppercase tracking-[0.12em] text-white transition-colors hover:bg-[#1DA851]"
                    >
                      <WhatsAppGlyph size={15} />
                      {t("chat")}
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
