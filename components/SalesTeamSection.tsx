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
 * Every hover/motion effect below is plain CSS (see the .sales-* rules in
 * app/globals.css) for exactly that reason — this stays a Server Component.
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
function WhatsAppGlyph({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      className={["shrink-0", className].filter(Boolean).join(" ")}
      aria-hidden
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}

const ICON_BUTTON =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] border border-white/30 " +
  "text-white/85 transition-colors hover:border-white/70 hover:bg-white/10 hover:text-white";

/** Splits a trailing nickname in parentheses — e.g. "Mr.Sunthorn Areeras
 *  (Nhong)" — off into its own accent-colored, lighter-weight span. Names
 *  with no parenthetical render unchanged. */
function renderName(name: string) {
  const match = name.match(/^(.*\S)\s+(\([^)]+\))\s*$/);
  if (!match) return name;
  const [, main, nickname] = match;
  return (
    <>
      {main} <span className="font-light text-accent">{nickname}</span>
    </>
  );
}

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
    <section className="relative overflow-hidden bg-surface py-16 sm:py-20">
      {/* Decorative wave lines along the bottom edge — see the .sales-wave-*
          rules in app/globals.css for the drift animation. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[260px]">
        <svg
          className="sales-wave-1 absolute bottom-0 left-0 h-full w-[200%]"
          viewBox="0 0 2880 260"
          preserveAspectRatio="none"
        >
          <path
            d="M0 150 C 180 110 360 190 540 150 S 900 110 1080 150 S 1260 190 1440 150 S 1620 110 1800 150 S 2160 190 2340 150 S 2700 110 2880 150"
            fill="none"
            stroke="var(--color-primary)"
            strokeOpacity="0.07"
            strokeWidth="1.5"
          />
          <path
            d="M0 195 C 180 155 360 235 540 195 S 900 155 1080 195 S 1260 235 1440 195 S 1620 155 1800 195 S 2160 235 2340 195 S 2700 155 2880 195"
            fill="none"
            stroke="var(--color-primary)"
            strokeOpacity="0.05"
            strokeWidth="1.5"
          />
        </svg>
        <svg
          className="sales-wave-2 absolute bottom-0 left-0 h-full w-[200%]"
          viewBox="0 0 2880 260"
          preserveAspectRatio="none"
        >
          <path
            d="M0 120 C 240 80 480 160 720 120 S 1200 80 1440 120 S 1920 160 2160 120 S 2640 80 2880 120"
            fill="none"
            stroke="var(--color-accent-500)"
            strokeOpacity="0.22"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      <div className="container-luxe relative">
        <Reveal>
          <p className="text-[10px] font-normal uppercase tracking-[0.28em] text-accent-700">
            {t("eyebrow")}
          </p>
          <h2 className="mt-3 text-[30px] font-light leading-tight text-primary">{t("title")}</h2>
          <p className="mt-1.5 max-w-[520px] text-[13px] font-light leading-relaxed text-ink-muted">
            {t("subtitle")}
          </p>
        </Reveal>

        {/* <sm: a swipeable row (flex + overflow-x-auto + snap). sm+: a plain
            grid — see .sales-track in app/globals.css for the hidden
            scrollbar. */}
        <div
          className="sales-track mt-12 flex snap-x snap-mandatory gap-3.5 overflow-x-auto
              sm:grid sm:snap-none sm:grid-cols-2 sm:gap-5 sm:overflow-visible lg:grid-cols-4"
        >
          {team.map((person, index) => {
            const { name, position } = person;

            // Same wa.me construction as contact/page.tsx and SiteCta.
            const waNumber = person.whatsappNumber.replace(/\D/g, "");
            const waGreeting = encodeURIComponent(tChat("whatsappGreeting"));
            const whatsappUrl = `https://wa.me/${waNumber}?text=${waGreeting}`;

            return (
              <Reveal
                key={person.id}
                delay={0.25 + index * 0.12}
                // No horizontal shrink: on the mobile row a card can sit
                // mostly off-screen to the right, peeking in on purpose as
                // a "swipe for more" hint — the default -80px margin reads
                // that sliver as still outside the viewport and leaves it
                // stuck at opacity 0 until the visitor swipes further.
                margin="-80px 0px -80px 0px"
                className="w-[300px] shrink-0 snap-start sm:w-auto sm:shrink sm:snap-align-none"
              >
                <div
                  className="sales-card relative flex h-full flex-col gap-5 overflow-hidden rounded-[14px]
                      border border-primary bg-primary px-[22px] pt-[26px] pb-[22px]
                      transition-[transform,border-color,box-shadow] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]
                      hover:-translate-y-2 hover:border-accent/70 hover:shadow-[0_30px_60px_-24px_rgba(4,29,44,0.55)]"
                >
                  {/* Decorative index number, sits behind everything else in
                      the card. */}
                  <span
                    aria-hidden
                    className="sales-bignum pointer-events-none absolute -right-2 -bottom-[30px] text-[140px]
                        leading-none font-light text-transparent"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>

                  <div className="flex items-center gap-3.5">
                    <span className="relative block h-[92px] w-[92px] shrink-0">
                      <svg
                        aria-hidden
                        className="sales-orbit absolute inset-0"
                        width="92"
                        height="92"
                        viewBox="0 0 92 92"
                      >
                        <circle
                          cx="46"
                          cy="46"
                          r="44"
                          fill="none"
                          stroke="var(--color-accent)"
                          strokeOpacity="0.35"
                          strokeWidth="1"
                          strokeDasharray="2 5"
                        />
                        <circle
                          cx="46"
                          cy="46"
                          r="44"
                          fill="none"
                          stroke="var(--color-accent)"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeDasharray="60 217"
                        />
                      </svg>

                      {person.photoUrl ? (
                        <span className="sales-photo absolute top-3 left-3 block h-[68px] w-[68px] overflow-hidden rounded-full">
                          <ImageWithSkeleton
                            src={person.photoUrl}
                            alt=""
                            fill
                            sizes="68px"
                            className="object-cover"
                          />
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="absolute top-3 left-3 flex h-[68px] w-[68px] items-center justify-center
                              rounded-full border border-accent/60 bg-white/5 text-lg font-medium text-accent"
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
                        className="sales-dot absolute right-[13px] bottom-[13px] block h-3 w-3 rounded-full
                            border-2 border-primary bg-green-500"
                      />
                    </span>

                    <div className="min-w-0">
                      <p className="text-sm leading-snug font-normal text-white">{renderName(name)}</p>
                      <p className="mt-1 text-[9px] leading-normal font-normal tracking-[0.2em] text-white/55 uppercase">
                        {position}
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-white/14" />

                  <div className="flex flex-col gap-2 text-xs font-light text-white/85">
                    <a
                      href={`tel:${person.phoneNumber}`}
                      className="flex items-center gap-2.5 transition-colors hover:text-white"
                    >
                      <Phone size={13} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden />
                      {person.phoneNumber}
                    </a>

                    {person.email && (
                      <a
                        href={`mailto:${person.email}`}
                        className="flex items-center gap-2.5 transition-colors hover:text-white"
                      >
                        <Mail size={13} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden />
                        <span className="truncate">{person.email}</span>
                      </a>
                    )}
                  </div>

                  {/* mt-auto so a card whose person has no email still puts
                      its buttons on the same line as the others in the row. */}
                  <div className="mt-auto flex items-center gap-2">
                    <a href={`tel:${person.phoneNumber}`} aria-label={tCommon("callUs")} className={ICON_BUTTON}>
                      <Phone size={15} strokeWidth={1.5} aria-hidden />
                    </a>

                    {person.email && (
                      <a
                        href={`mailto:${person.email}`}
                        aria-label={tCommon("emailUs")}
                        className={ICON_BUTTON}
                      >
                        <Mail size={15} strokeWidth={1.5} aria-hidden />
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
                      className="sales-chat flex h-11 flex-1 items-center justify-center gap-2 rounded-[4px]
                          bg-[#25D366] text-[11px] font-medium tracking-[0.18em] text-white uppercase
                          transition-[background-color,box-shadow] duration-300 hover:bg-[#1ebe5d]
                          hover:shadow-[0_12px_26px_-10px_rgba(37,211,102,0.8)]"
                    >
                      <WhatsAppGlyph size={15} className="sales-chat-icon" />
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
